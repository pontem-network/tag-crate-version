const util = require('util');
const exec = util.promisify(require('child_process').exec);


(async function () {
	await prepare_deps();
	await main();
})();


async function prepare_deps() {
	try {
		const { err, stderr } = await exec("npm i", { cwd: __dirname });
		if (err)
			fail("Unable to install dependencies:", err);
		if (stderr && stderr.toString().trim().length > 0)
			fail(`Error caused when trying to install dependencies ${stderr}`);
	} catch (error) {
		fail("Unable to install dependencies:", error.message);
	}
}


async function main() {
	let method;
	try {
		const { err, stderr } = await exec("which cargo");
		if (err || (stderr && stderr.toString().trim().length > 0)) {
			method = run_fallback;
		} else {
			method = run_cargo;
		}
	} catch (error) {
		method = run_fallback;
	}

	const inputs = get_github_action_input();
	return await method(inputs);
}



async function run_cargo(opts) {
	const wcargo = require('./with-cargo');
	return await run(opts, wcargo);
}

async function run_fallback(opts) {
	return await run(opts, {
		get_root: async (pwd) => require('./fallback').get_root(pwd),
		get_workspace_members: async (pwd) => require('./fallback').get_workspace_members(pwd),
	});
}


async function run(opts, impl) {
	let crate = await get_crate(opts.input_crate_name, opts.pwd, impl);
	if (!crate || !crate.name || !crate.version) {
		return fail("Crate not found");
	}

	const new_tag = crate.version.replace(new RegExp("(.*)"), opts.version_to_tag);
	const last_tag = await get_last_tag(opts.pwd);

	console.log("crate:", crate);
	console.log("tags:", last_tag, "=>", new_tag);

	let output = {
		crate: crate.name,
		current: crate.version,
		tag: new_tag,
	};

	set_github_action_output(output);

	function notice_or_error(message) {
		if (message.toString().toLowerCase().includes("already exists")) {
			notice(message);
		} else {
			fail(message);
		}
	}

	if (last_tag) {
		const matched = last_tag.match(new RegExp(opts.tag_to_version));
		const last_ver = matched ? matched[1] : last_tag;
		set_github_action_output({ previous: last_ver });

		if (last_ver != crate.version)
			await push_tag(opts.pwd, new_tag, opts.dry_run).then(() => set_github_action_output({ success: true })).catch(notice_or_error);
	}
	else {
		notice("Can't determine latest tag via `git describe`, so just trying to push new tag anyway");
		await push_tag(opts.pwd, new_tag, opts.dry_run).then(() => set_github_action_output({ success: true })).catch(notice_or_error);
	}
}


function get_github_action_input() {
	try {
		const core = require('@actions/core');
		const optional = { required: false, trimWhitespace: true };
		return {
			input_crate_name: core.getInput('crate', optional) || process.env.INP_CRATE,
			pwd: core.getInput('pwd', optional) || process.env.INP_PWD,
			tag_to_version: core.getInput('tag-to-version', optional) || process.env.INP_TAG_TO_VERSION,
			version_to_tag: core.getInput('version-to-tag', optional) || process.env.INP_VERSION_TO_TAG,
			dry_run: core.getInput('dry-run', optional) || process.env.INP_DRY_RUN,
			github_token: core.getInput('token', optional) || process.env.INP_GITHUB_TOKEN,
		}
	} catch (error) {
		fail(error.message);
	}

	return {};
}

function set_github_action_output(output) {
	const core = require('@actions/core');
	for (key in output) {
		core.setOutput(key, output[key]);
		// console.log(`::set-output name=${key}::${output[key]}`);
	}
}

async function get_crate(name, pwd, impl) {
	let crate;
	if (name && name.trim().length > 0) {
		let workspace = await impl.get_workspace_members(pwd).catch(fail);
		for (i in workspace) {
			const item = workspace[i];
			if (item.name == name) {
				crate = item;
				break;
			}
		}
	} else {
		crate = await impl.get_root(pwd).catch(fail);
	}
	return crate;
}


async function get_last_tag(pwd) {
	const opt = { cwd: pwd };

	// prefetch
	try {
		await exec("git fetch --tags --prune-tags", opt);
	} catch (error) {
		console.warn(error.message);
	}


	async function gitDescribe(extraArgs = "") {
		try {
			const { err, stdout, stderr } = await exec("git describe --abbrev=0 " + extraArgs, opt);
			if (err) {
				notice(err);
				return undefined;
			}
			let result = stdout.trim();
			return result;
		} catch (error) {
			notice(error.message);
			return undefined;
		}
	}

	return (await gitDescribe("--tag") || await gitDescribe());
}

async function push_tag(pwd, tag, dry_run) {
	const opt = { cwd: pwd };
	{
		const { err } = await exec(`git tag "${tag}"`, opt);
		if (err) { return fail(err); }
	}
	if (!dry_run || dry_run + "" == "false") {
		const { err } = await exec("git push --tags", opt);
		if (err) { return fail(err); }
	} else {
		warning("Input argument `dry-run` passed as `" + dry_run + "`, so tag not pushed to git.");
	}
}


function fail(error) {
	try {
		const core = require('@actions/core');
		core.setFailed(error);
	} catch (_) {
		console.error(error);
	}
}

function warning(message) {
	console.log(`::warning ::${message}`);
}

function notice(message) {
	console.log(`::notice ::${message}`);
}
