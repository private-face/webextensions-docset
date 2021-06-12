# webextensions-docset

WebExtensions documentation set for Dash.app, based on [MDN WebExtensions](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions) by @private_face.

Generation script can be easily adjusted to build any other documentation from MDN.

## Building
This docset doesn't require downloading anything, documentation pages are buit locally from sources.

### Prerequisites
* Node >= 14
* Yarn

### Installation
1. Clone the repo and install its dependencies:
```bash
git clone git@github.com:private-face/webextensions-docset.git
cd webextensions-docset
yarn install

```
2. Build the project
```bash
yarn build

```

## Known issues
* Build will likely not work on Windows, and will probably non work on case-sensitive file-systems. Feel free to open a PR.

## License
MIT
