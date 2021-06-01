const fs = require('fs-extra');
const jsdom = require('jsdom');
const path = require('path');
const { JSDOM } = jsdom;

const MDN_URL = 'https://developer.mozilla.org';

function getRelativePath(absoluteFrom, relativeTo, cwd, check = false) {
    const from = absoluteFrom.replace(/#.*$/, '').endsWith('/index.html')
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

function fixUrls(dom, filePath, documentsFolder) {
    const document = dom.window.document;
    const cssFiles = [];

    document.querySelectorAll('[href], [src]').forEach(node => {
        if (node.nodeName === 'LINK' && node.getAttribute('rel').toLowerCase() === 'preload') {
            return;
        }
        const attrName = node.hasAttribute('href') ? 'href' : 'src';
        const url = node.getAttribute(attrName);
        if (!url.startsWith('/')) {
            // keep relative and external hrefs
            return;
        }

        const isLink = node.nodeName === 'A';
        const isCSS = node.nodeName === 'LINK' && node.getAttribute('rel').toLowerCase() === 'stylesheet';

        const relativePath = getRelativePath(filePath, url, documentsFolder, true);
        const targetFileExists = relativePath !== null;
        const newUrl = !targetFileExists
            ? MDN_URL + url
            : isLink 
            ? relativePath.replace(/(#.*)?$/, '/index.html$1')
            : relativePath;

        // mark relative paths that are not accessible as external
        node.setAttribute(attrName, newUrl);
        if (isLink && !targetFileExists) {
            node.classList.add('external');
        }

        // console.log(`${node.nodeName}: "${url}" -> "${newUrl}" ${relativePath !== null ? '(file exists)' : ''}`);

        if (isCSS && targetFileExists) {
            cssFiles.push(path.resolve(documentsFolder, url.slice(1)));
        }
    });

    return cssFiles;
}

function buildTableOfContents(dom) {
    const document = dom.window.document;

    document.querySelectorAll('h2 > a').forEach(node => {
        const entryName = encodeURIComponent(node.textContent);
        const a = document.createElement('a');
        a.name = `//apple_ref/cpp/Section/${entryName}`;
        a.className = 'dashAnchor';
        node.before(a);
    });
}

module.exports = function postProcess(filePaths, documentsFolder) {
    let cssPaths = [];

    filePaths.forEach((filePath) => {
       const html = fs.readFileSync(filePath, 'utf8').toString();
        const dom = new JSDOM(html);

        // remove scripts (TODO it in yari)
        dom.window.document.querySelectorAll('script').forEach(node => node.remove());

        // fix URLs in all tags, containing `href` or `src`
        const css = fixUrls(dom, filePath, documentsFolder);
        cssPaths = cssPaths.concat(css);

        // build table of contents
        buildTableOfContents(dom);

        fs.writeFileSync(filePath, dom.serialize());
    });

    // fix urls in CSS files
    Array.from(new Set(cssPaths)).forEach(cssPath => {
        if (!cssPath) {
            return;
        }
        const css = fs.readFileSync(cssPath, 'utf8').toString();
        fs.writeFileSync(cssPath, css.replace(/url\(\/static\//g, 'url(../'));
    })
};
