# webextensions-docset

WebExtensions documentation set for Dash.app, based on [MDN WebExtensions](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions) by @private_face.

Generation script can be easily adjusted to build any other documentation from MDN.

## Building
Thanks to the fact that Mozilla open-sourced content of MDN website as well as the engine powering it, this docset doesn't require you to download anything. Everything is buit locally from sources. All necessary dependencies are already included in this repository as subtrees.

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
