const fs = require('fs-extra');
const path = require('path');
const yaml = require('js-yaml');

const RE_META = /---((?:\n.*)*)---/;
const RE_CAPITALIZED = /^[A-Z][a-zA-Z0-9]*$/;
const RE_UPPER_SNAKE_CASE = /^[A-Z][A-Z0-9_]*$/;
const RE_CAMEL_CASE = /^[a-z][a-zA-Z0-9]*$/;
const RE_EVENT = /^on[A-Z].*$/;
const ACCEPTED_TAGS = new Set(['Property', 'Method', 'Type', 'Event', 'Constant']);

function inferTypeFromName(title) {
    const titleParts = title.split('.');
    const name = titleParts.pop();

    switch (true) {
        case !!name.match(RE_EVENT):
            return 'Event';
        case name.endsWith('()'):
            return 'Method';
        case !!name.match(RE_UPPER_SNAKE_CASE):
            return 'Constant';
        case !!name.match(RE_CAMEL_CASE):
            return 'Property';
        case !!name.match(RE_CAPITALIZED):
            return 'Type';
    }
    return null;
}

function createAPIDocEntry({ title, slug, tags }, apiDocPath) {
    const isManifest = slug.includes('/manifest.json/');
    const isAPI = slug.includes('/API/');
    const titleParts = title.split('.');
    const name = titleParts.pop();
    const typeFromName = inferTypeFromName(name);
    const typesFromTags = tags.filter(tag => ACCEPTED_TAGS.has(tag));
    const typeFromTags = typesFromTags && typesFromTags[0];

    const isTopLevel = !!slug.match(/\/API\/[^/]+$/i);
    const invalidAPINAme = !!name.match(/[^a-z0-9_()]/i);
    const isNamespace = isTopLevel && !invalidAPINAme;

    if (isAPI && !isNamespace && !invalidAPINAme && titleParts.length === 0) {
        // API title consists of a single word, but it is not a Namespace, i. e. we have properties or methods like `set()`, 'onCommand' at the top level.
        // Let's fix their title by adding the proper namespace, inferred from the slug.
        const inferredNamespace = slug.replace(/^.*\/API\//, '').split('/').slice(0, -1).join('.');
        // console.warn(`Warning: ${typeFromName || typeFromTags} "${name}" does not belong to any namespace. Is it "${inferredNamespace}"?`);
        title = `${inferredNamespace}.${name}`;
    }

    if (typesFromTags.length > 1) {
        console.warn(`Warning: ambiguous resource type for "${title}": "${typesFromTags}"`)
    }

    if (isManifest && titleParts > 0) {
        console.warn(`Warning: nested manifest key "${title}"`);
    }

    let type;

    switch (true) {
        // All pages at the top level of "manifest.json" folder are 'Sections'
        case isManifest:
            type = 'Section';
            break;
        // All pages that are neither APIs nor manifest.json keys are 'Guides'
        case !isAPI:
            type = 'Guide';
            break;
        // Top-level pages inside 'API' folder is a 'Namespace'
        case isNamespace:
            type = 'Namespace';
            break;
        // Resources inside 'API' folder which are also 'Guides'
        case invalidAPINAme:
            type = 'Guide';
            break;
        // 'Method' tag is correct
        case typesFromTags.includes('Method'):
            type = 'Method';
            break;
        // In all other cases type inferred from name seems to be more correct than from tags
        case typeFromName !== null:
            if (typesFromTags.length && !typesFromTags.includes(typeFromName)) {
                // console.warn(`Warning: Types do not match for "${title}": tags say "${typesFromTags}", inferred type is "${typeFromName}"`);
            }
            type = typeFromName;
            break;
        // It is very unlikely we end up here, but type in tag is better than no type at all
        case !!typeFromTags:
            type = typeFromTags;
            break;
        default:
            console.warn(`Warning: Could not detect resource type for "${title}", falling back to "Object"`);
            type = 'Object';
    }

    return [type, title, apiDocPath.replace(/.*\/(en-us)/i, '$1/docs')];
}

function buildIndex(apiDocs) {
    return rows = apiDocs.map((apiDocPath) => {
        const fileStr = fs.readFileSync(apiDocPath, 'utf8').toString();
        const meta = {};
        const match = fileStr.match(RE_META) || [, ''];
        const fileMeta = yaml.load(match[1]) || {};
        const { title, slug, tags = [] } = fileMeta;

        if (!title || !slug) {
            console.warn(`Warning: Can't add "${apiDocPath}" to the index, important metadata is missing.`);
            return null;
        }

        return createAPIDocEntry(fileMeta, apiDocPath);
    });
};

module.exports = {
    inferTypeFromName,
    buildIndex,
}