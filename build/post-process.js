const fs = require('fs-extra');
const jsdom = require('jsdom');
const path = require('path');
const { JSDOM } = jsdom;
const expand = require('./expand.js');

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
        const isIMG = node.nodeName === 'IMG';

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

        if (isCSS && targetFileExists) {
            cssFiles.push(path.resolve(documentsFolder, url.slice(1)));
        }

        // while we are at it, fix images with transparent background
        if (isIMG) {
            node.style.backgroundColor = '#fff';
        }
    });

    return cssFiles;
}

function buildTableOfContents(dom, filePath) {
    const document = dom.window.document;
    const isAPI = filePath.toLowerCase().includes('/api/');
    const API_HEADERS = {
        'properties': 'Property',
        'methods': 'Method',
        'types': 'Type',
        'events': 'Event',
        'event handlers': 'Event',
        'interfaces': 'Interface',
        'functions': 'Function',
        'constants': 'Constant',
        'javascript api listing': 'Namespace',
    };

    const createTOCEntry = (node, resourceName, entryName) => {
        const a = document.createElement('a');
        a.name = `//apple_ref/cpp/${resourceName}/${encodeURIComponent(entryName)}`;
        a.className = 'dashAnchor';
        node.prepend(a);
    }

    document.querySelectorAll('h2').forEach(node => {
        const entryName = node.textContent.trim();
        createTOCEntry(node, 'Section', entryName);

        // we can extract more from an api page
        const resourceName = API_HEADERS[entryName.toLowerCase()];
        if (!isAPI || !resourceName) {
            return;
        }

        node.nextSibling.querySelectorAll('dt').forEach(apiNode => {
            createTOCEntry(apiNode, resourceName, apiNode.textContent.trim());
        });
    });
}

module.exports = function postProcess(filePaths, documentsFolder) {
    let cssPaths = [];

    filePaths.forEach((filePath) => {
       const html = fs.readFileSync(filePath, 'utf8').toString();
        const dom = new JSDOM(html);
        const document = dom.window.document;

        // fix URLs in all tags, containing `href` or `src`
        const css = fixUrls(dom, filePath, documentsFolder);
        cssPaths = cssPaths.concat(css);

        // build table of contents
        buildTableOfContents(dom, filePath);

        // inject compatibility table expand script
        const script = document.createElement('script');
        script.textContent = `(${expand.toString()})();`;
        document.body.append(script);

        // write modified html
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
