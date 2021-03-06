const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const chalk = require("chalk");
const cliProgress = require("cli-progress");
const program = require("@caporal/core").default;
const { prompt } = require("inquirer");

const {
  Document,
  slugToFolder,
  translationsOf,
  CONTENT_ROOT,
  CONTENT_TRANSLATED_ROOT,
  CONTENT_ARCHIVED_ROOT,
} = require("../content");
const { VALID_LOCALES } = require("../libs/constants");
// eslint-disable-next-line node/no-missing-require
const { renderDocHTML } = require("../ssr/dist/main");
const options = require("./build-options");
const { buildDocument, renderContributorsTxt } = require("./index");
const SearchIndex = require("./search-index");
const { BUILD_OUT_ROOT } = require("./constants");
const { makeSitemapXML, makeSitemapIndexXML } = require("./sitemaps");
const { humanFileSize } = require("./utils");

async function buildDocumentInteractive(
  documentPath,
  interactive,
  invalidate = false
) {
  try {
    const document = invalidate
      ? Document.read(documentPath, Document.MEMOIZE_INVALIDATE)
      : Document.read(documentPath);

    if (!document) {
      throw new Error(`${documentPath} could not be read`);
    }

    if (!interactive) {
      const translations = translationsOf(document.metadata);
      if (translations && translations.length > 0) {
        document.translations = translations;
      } else {
        document.translations = [];
      }
    }

    return { document, doc: await buildDocument(document), skip: false };
  } catch (e) {
    if (!interactive) {
      throw e;
    }
    console.error(e);
    const { action } = await prompt([
      {
        type: "list",
        message: "What to do?",
        name: "action",
        choices: [
          { name: "re-run", value: "r" },
          { name: "skip", value: "s" },
          { name: "quit", value: "q" },
        ],
        default: "r",
      },
    ]);
    if (action === "r") {
      return await buildDocumentInteractive(documentPath, interactive, true);
    }
    if (action === "s") {
      return { doc: {}, skip: true };
    }
    throw e;
  }
}

async function buildDocuments(
  files = null,
  quiet = false,
  interactive = false,
  locales = new Map()
) {
  // If a list of files was set, it came from the CLI.
  // Override whatever was in the build options.
  const findAllOptions = Object.assign({}, options, { locales });
  if (files) {
    findAllOptions.files = new Set(files);
  }

  const documents = Document.findAll(findAllOptions);
  const progressBar = new cliProgress.SingleBar(
    {},
    cliProgress.Presets.shades_grey
  );

  const docPerLocale = {};
  const searchIndex = new SearchIndex();

  if (!documents.count) {
    throw new Error("No documents to build found");
  }

  let peakHeapBytes = 0;

  // For keeping track of the total counts of flaws
  const totalFlaws = new Map();

  function appendTotalFlaws(flaws) {
    for (const [key, actualFlaws] of Object.entries(flaws)) {
      const count = actualFlaws.length;
      if (!totalFlaws.has(key)) {
        totalFlaws.set(key, 0);
      }
      totalFlaws.set(key, totalFlaws.get(key) + count);
    }
  }

  if (!options.noProgressbar) {
    progressBar.start(documents.count);
  }

  for (const documentPath of documents.iter({ pathOnly: true })) {
    const {
      doc: { doc: builtDocument, liveSamples, fileAttachments, bcdData },
      document,
      skip,
    } = await buildDocumentInteractive(documentPath, interactive);
    if (skip) {
      continue;
    }

    const outPath = path.join(BUILD_OUT_ROOT, slugToFolder(document.url));
    fs.mkdirSync(outPath, { recursive: true });

    if (builtDocument.flaws) {
      appendTotalFlaws(builtDocument.flaws);
    }

    fs.writeFileSync(
      path.join(outPath, "index.html"),
      renderDocHTML(builtDocument, document.url)
    );
    // There are some archived documents that, due to possible corruption or other
    // unknown reasons, don't have a list of contributors.
    if (document.metadata.contributors || !document.isArchive) {
      fs.writeFileSync(
        path.join(outPath, "contributors.txt"),
        renderContributorsTxt(
          document.metadata.contributors,
          !document.isArchive
            ? builtDocument.source.github_url.replace("/blob/", "/commits/")
            : null
        )
      );
    }

    for (const { id, html } of liveSamples) {
      const liveSamplePath = path.join(outPath, `_sample_.${id}.html`);
      fs.writeFileSync(liveSamplePath, html);
    }

    for (const filePath of fileAttachments) {
      // We *could* use symlinks instead. But, there's no point :)
      // Yes, a symlink is less disk I/O but it's nominal.
      fs.copyFileSync(filePath, path.join(outPath, path.basename(filePath)));
    }

    // Collect non-archived documents' slugs to be used in sitemap building and
    // search index building.
    if (!builtDocument.noIndexing) {
      const { locale, slug } = document.metadata;
      if (!docPerLocale[locale]) {
        docPerLocale[locale] = [];
      }
      docPerLocale[locale].push({
        slug,
        modified: document.metadata.modified,
      });

      searchIndex.add(document);
    }

    if (!options.noProgressbar) {
      progressBar.increment();
    } else if (!quiet) {
      console.log(outPath);
    }
    const heapBytes = process.memoryUsage().heapUsed;
    if (heapBytes > peakHeapBytes) {
      peakHeapBytes = heapBytes;
    }
  }

  if (!options.noProgressbar) {
    progressBar.stop();
  }

  return { slugPerLocale: docPerLocale, peakHeapBytes, totalFlaws };
}

function formatTotalFlaws(flawsCountMap, header = "Total_Flaws_Count") {
  if (!flawsCountMap.size) {
    return "";
  }
  const keys = [...flawsCountMap.keys()];
  const longestKey = Math.max(...keys.map((k) => k.length));
  const out = ["\n"];
  out.push(header);
  for (const key of keys.sort()) {
    out.push(
      `${key.padEnd(longestKey + 1)} ${flawsCountMap.get(key).toLocaleString()}`
    );
  }
  out.push("\n");
  return out.join("\n");
}

program
  .name("build")
  .option("-i, --interactive", "Ask what to do when encountering flaws", {
    default: false,
  })
  .option("-l, --locale <locale...>", "Filtered specific locales", {
    default: [],
    validator: [...VALID_LOCALES.keys()],
  })
  .argument("[files...]", "specific files to build")
  .action(async ({ args, options }) => {
    try {
      if (!options.quiet) {
        const roots = [
          ["CONTENT_ROOT", CONTENT_ROOT],
          ["CONTENT_TRANSLATED_ROOT", CONTENT_TRANSLATED_ROOT],
          ["CONTENT_ARCHIVED_ROOT", CONTENT_ARCHIVED_ROOT],
        ];
        for (const [key, value] of roots) {
          console.log(
            `${chalk.grey((key + ":").padEnd(25, " "))}${
              value ? chalk.white(value) : chalk.grey("not set")
            }`
          );
        }
      }
      const { files } = args;

      // 'true' means we include this locale and all others get excluded.
      // Some day we might make it an option to set `--not-locale` to
      // filter out specific locales.
      const locales = new Map(
        // The `options.locale` is either an empty array (e.g. no --locale used),
        // a string (e.g. one single --locale) or an array of strings
        // (e.g. multiple --locale options).
        (Array.isArray(options.locale) ? options.locale : [options.locale]).map(
          (locale) => [locale, true]
        )
      );
      const t0 = new Date();
      const { slugPerLocale, peakHeapBytes, totalFlaws } = await buildDocuments(
        files,
        Boolean(options.quiet),
        Boolean(options.interactive),
        locales
      );
      const t1 = new Date();
      const count = Object.values(slugPerLocale).reduce(
        (a, b) => a + b.length,
        0
      );
      const seconds = (t1 - t0) / 1000;
      const took =
        seconds > 60
          ? `${(seconds / 60).toFixed(1)} minutes`
          : `${seconds.toFixed(1)} seconds`;
      if (!options.quiet) {
        console.log(
          `Built ${count.toLocaleString()} pages in ${took}, at a rate of ${(
            count / seconds
          ).toFixed(1)} documents per second.`
        );
        console.log(`Peak heap memory usage: ${humanFileSize(peakHeapBytes)}`);
        console.log(formatTotalFlaws(totalFlaws));
      }
    } catch (error) {
      // So you get a stacktrace in the CLI output
      console.error(error);
      // So that the CLI ultimately fails
      throw error;
    }
  });

program.run();
