const fs = require('fs-extra');
const path = require('path');
const fastGlob = require('fast-glob');
const sqlite3 = require('sqlite3');
const execSync = require('child_process').execSync;

const buildIndex = require('./build/build-index');
const postProcess = require('./build/post-process');

function generateSQL(apiDocs) {
    const rows = buildIndex(apiDocs);
    let sql = `
        CREATE TABLE searchIndex(id INTEGER PRIMARY KEY, name TEXT, type TEXT, path TEXT);
        CREATE UNIQUE INDEX anchor ON searchIndex (name, type, path);
    ` + rows.map(row => {
        if (row === null) {
            return '';
        }
        const [type, name, dir] = row;

        // check if file is accessible
        const filePath = path.resolve(__dirname, 'webextensions.docset/Contents/Resources/Documents/' + dir);
        try {
            fs.accessSync(filePath);
        } catch (e) {
            console.error(`Error: File "${filePath}" is inaccessible`);
            return '';
        }
        return `INSERT OR IGNORE INTO searchIndex(name, type, path) VALUES ('${name}', '${type}', '${dir}');\n`;
    }).join('');
    return sql;
}

const webextensionsSubtree = 'en-us/mozilla/add-ons/webextensions';
const docsWebextensionsSubtree = 'en-us/docs/mozilla/add-ons/webextensions';
const mdnContentFolder = path.resolve(__dirname, 'mdn/content/files');
const webextensionsContentFolder = path.resolve(mdnContentFolder, webextensionsSubtree);

const mdnYariFolder = path.resolve(__dirname, 'mdn/yari');
const builtPagesFolder = path.resolve(mdnYariFolder, 'client/build');

const outputFolder = path.resolve(__dirname, 'webextensions.docset/Contents/Resources');
const documentsFolder = path.resolve(outputFolder, 'Documents');
const searchIndexFile = path.resolve(outputFolder, 'docSet.dsidx');
const searchOptimizedIndexFile = path.resolve(outputFolder, 'optimizedIndex.dsidx');

function rm(file) {
    try {
        fs.rmSync(file, { recursive: true });
    } catch (o_0)
             { }
}

function main() {
    const tempContentFolder = path.resolve(__dirname, 'mdn_content');

    // 0. Clean up the previous build (database, Documents folder)
    console.log('0. Cleaning up...');
    rm(documentsFolder);
    rm(tempContentFolder);
    fs.mkdirSync(documentsFolder, { recursive: true});
    rm(searchIndexFile);
    rm(searchOptimizedIndexFile);

    // 1. Create temp dir
    const tempWebextensionsFolder = path.resolve(tempContentFolder, webextensionsSubtree);
    console.log(tempContentFolder);

    // 2. Copy webextension APIs to the temp dir
    fs.mkdirSync(tempWebextensionsFolder, { recursive: true });
    fs.copySync(path.resolve(mdnContentFolder, 'popularities.json'), path.resolve(tempContentFolder, 'popularities.json'));
    fs.copySync(webextensionsContentFolder, tempWebextensionsFolder);

    // 3. Build ssr
    // 3. Build MDN pages from extracted content
    console.log('3. Building MDN docs...');
    execSync(`echo CONTENT_ROOT="${tempContentFolder}" > .env`, {
        cwd: mdnYariFolder,
    });
    execSync(`yarn build`, {
        cwd: mdnYariFolder,
    }).toString();

    console.log('4. Copying MDN docs...');
    // 4. Copy fixed MDN pages to Documents folder
    fs.copySync(builtPagesFolder, documentsFolder);

    // 5. Fix built MDN pages (remove scripts and fix static URLs)
    console.log('5. Post processing...')
    const filePaths = fastGlob.sync(path.resolve(documentsFolder, docsWebextensionsSubtree, '**/index.html'));
    postProcess(filePaths, documentsFolder);

    // // 6. Create database
    console.log('6. Building index...')
    const apiDocs = fastGlob.sync(
        path.resolve(tempWebextensionsFolder, '**/*.html')
    );

    sqlite3.verbose();
    const db = new sqlite3.Database(searchIndexFile);
    db.on('error', (err) => {
        console.error('Error:', err);
    });
    db.on('open', () => {
        // 7. Populate index
        db.exec(generateSQL(apiDocs), () => {
            db.close();
        });
    });

    // 8. You are BREATHTAKING!
}

main();
