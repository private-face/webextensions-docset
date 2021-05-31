const fs = require('fs-extra');
const jsdom = require('jsdom');
const path = require('path');
const { JSDOM } = jsdom;

const MDN_URL = 'https://developer.mozilla.org';

function getRelativePath(absoluteFrom, relativeTo, cwd, check = false) {
    const from = absoluteFrom.endsWith('index.html')
        ? absoluteFrom.split(path.sep).slice(0, -1).join(path.sep)
        : absoluteFrom;

    const to = relativeTo.startsWith('/')
        ? path.resolve(cwd, relativeTo.slice(1))
        : relativeTo;

    const relativePath = path.relative(from, to);

    // check if file can be accessed by the constructed path
    if (check) {
        try {
            fs.accessSync(path.resolve(from, relativePath.replace(/#.*$/, '')));
        } catch(e) {
            return null;
        }
    }

    return relativePath;
}

function fixStyle(filePath, documentsFolder, dom) {
    const document = dom.window.document;

    // fix path to css
    const style = document.querySelector('link[rel="stylesheet"]');
    const styleHref = style.getAttribute('href');
    style.setAttribute('href', getRelativePath(filePath, styleHref, documentsFolder));

    // to fix paths in css later
    return path.resolve(documentsFolder, styleHref.slice(1));
}

function fixLinks(filePath, documentsFolder, dom) {
    const document = dom.window.document;

    document.querySelectorAll('a[href]').forEach(node => {
        const href = node.getAttribute('href');
        if (!href.startsWith('/')) {
            return;
        }

        const relativePath = getRelativePath(filePath, href, documentsFolder, true);
        const newHref = relativePath === null
            ? MDN_URL + href
            : relativePath.replace(/(#.*)$/, '/index.html$1');

        node.setAttribute('href', newHref);
        if (relativePath === null) {
            node.classList.add('external');
        }
    });
}

module.exports = function postProcess(filePaths, documentsFolder) {
    let cssPath;

    filePaths.forEach((filePath) => {
        // console.log('Processing: ', filePath, '...');
        const html = fs.readFileSync(filePath, 'utf8').toString();
        const dom = new JSDOM(html);

        // fix css
        cssPath = fixStyle(filePath, documentsFolder, dom);

        // fix links
        fixLinks(filePath, documentsFolder, dom);

        // todo images

        // remove scripts (TODO it in yari)
        // dom.window.document.querySelectorAll('script').forEach(node => node.remove());

        fs.writeFileSync(filePath, dom.serialize());
    });

    if (cssPath) {
        const css = fs.readFileSync(cssPath, 'utf8').toString();
        fs.writeFileSync(cssPath, css.replace(/url\(\/static\//g, 'url(../'));
    }
};
