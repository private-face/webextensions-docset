const fs = require('fs-extra');
const path = require('path');
const yaml = require('js-yaml');

const RE_META = /---((?:\n.*)*)---/;
const RE_UPPER_SNAKE_CASE = /^[A-Z][A-Z0-9_]*$/;
const RE_CAMEL_CASE = /^[a-z][a-zA-Z0-9]*$/;
const ACCEPTED_TAGS = new Set(['Property', 'Method', 'Type', 'Event']);
const PREDEFINED_INTERFACES = new Set(['devtools.inspectedWindow', 'devtools.network', 'devtools.panels']);

function getResourceType({ title, slug, tags }) {
    const isManifest = slug.includes('/manifest.json/');
    const isAPI = slug.includes('/API/');
    const typeFromTags = tags.find(tag => ACCEPTED_TAGS.has(tag));
    const titleParts = title.split('.');
    const name = titleParts.pop();

    switch (true) {
        case !!typeFromTags:
            return typeFromTags;
        case isManifest:
            return 'Section';
        case !isAPI:
            return 'Guide';
        case PREDEFINED_INTERFACES.has(title):
            return 'Interface';
        case titleParts.length === 0:
            return 'Namespace'; // mb 'Module' or even 'Object'?
        case name.endsWith('()'):
            console.log(`Warning: Could not detect resource type for "${title}", assuming "Method"`);
            return 'Method';
        case !!name.match(RE_UPPER_SNAKE_CASE):
            console.log(`Warning: Could not detect resource type for "${title}", assuming "Constant"`);
            return 'Constant';
        case !!name.match(RE_CAMEL_CASE):
            console.log(`Warning: Could not detect resource type for "${title}", assuming "Property"`);
            return 'Property';
        default:
            console.log(`Warning: Could not detect resource type for "${title}", falling back to "Object"`);
            return 'Object';
    }   
}

module.exports = function buildIndex(apiDocs) {
    return rows = apiDocs.map((apiDocPath) => {
        const fileStr = fs.readFileSync(apiDocPath, 'utf8').toString();
        const meta = {};
        const match = fileStr.match(RE_META) || [, ''];
        const fileMeta = yaml.load(match[1]) || {};
        const { title, slug, tags } = fileMeta;

        if (!title || !slug || !tags) {
            return null;
        }

        return [getResourceType(fileMeta), title, apiDocPath.replace(/.*\/en-us/, 'en-us/docs')];
    });
};
