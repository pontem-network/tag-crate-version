# Tag Crate Version

This GitHub Action creates a new tag on changed specified crate version.

It just takes crate version from manifest and tryes push new tag.


## Parameters

Inputs

- `crate` - Name of crate of interest. Default is root package. Optional. If omitted, it will default to root crate.
- `pwd` - Current working directory. Optional. Default is `./`.
- `tag-to-version` - Regex to determine version from tag. Optional. Default is `/v?([0-9]+.[0-9]+.*)/`.
- `version-to-tag` - Temptate for the tag, where `$1` is a placeholder for the version. Optional. Default is `v$1`.
- `token` - `GITHUB_TOKEN`. Optional.

Outputs

- `crate` - Crate name. Useful if used automatic selection of crate.
- `current` - Current version of the crate.
- `previous` - Previous version of the crate. Tetermined from previous tag.
- `tag` - Current tag just created.
- `success` - New tag was pushed successfully.


## Usage Example

Full example:

```yaml
name: Tag Version
on:
  push:
    branches:
      - master

jobs:
  push-tag:
    name: check version and create tag
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v2

      - id: new_tag
        name: try create tag
        uses: pontem-network/tag-crate-version@main
        with:
          crate: my-crate-name
          version-to-tag: "v$1"
          token: ${{ secrets.GITHUB_TOKEN }}

    outputs:
      crate: ${{ steps.new_tag.outputs.crate }}
      version: ${{ steps.new_tag.outputs.current }}
      tag: ${{ steps.new_tag.outputs.tag }}
      prev-tag: ${{ steps.new_tag.outputs.previous }}
      success: ${{ steps.new_tag.outputs.success }}

  release:
    needs: push-tag
    if: needs.push-tag.outputs.success
    # ..
```
