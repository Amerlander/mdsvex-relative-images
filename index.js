// credit to pngwn doing majority of the plugin - https://github.com/pngwn/MDsveX/discussions/246#discussioncomment-720947

import { visit } from "unist-util-visit";
import toCamel from "just-camel-case";

let defaultWidth = 768;

const RE_SCRIPT_START =
  /<script(?:\s+?[a-zA-z]+(=(?:["']){0,1}[a-zA-Z0-9]+(?:["']){0,1}){0,1})*\s*?>/;
const RE_SRC = /src\s*=\s*"(.+?)"/;

export default function relativeImages() {
  return function transformer(tree) {
    const urls = new Map();
    const url_count = new Map();

    function transformUrl(url) {
      if (url.startsWith(".")) {
        let options;
        let plainUrl;
        [plainUrl, ...options] = url.split("?");
        options = options.join('?') //.split("&").map(x => x.split("="));
        // console.log(options)
        options = new URLSearchParams(options);
        let width = options.get("width") || options.get("w") || defaultWidth;
        width = (parseInt(width) > 0) ? parseInt(width) : defaultWidth;
        console.log(width)
        console.log(options)

        if(url.includes('*')) {
          let newUrl = `{import.meta.globEager('${plainUrl}')}`;
          return newUrl;
        } else {
          // filenames can start with digits,
          // prepend underscore to guarantee valid module name
          let camel = `_${toCamel(url)}`;
          const count = url_count.get(camel);
          const dupe = urls.get(url);

          if (count && !dupe) {
            url_count.set(camel, count + 1);
            camel = `${camel}_${count}`;
          } else if (!dupe) {
            url_count.set(camel, 1);
          }

          urls.set(url, {
            path: `${plainUrl}?w=${width}`,
            optionsMeta: `w=${width}&metadata`,
            optionsJpeg: `w=${Math.floor(width/0.5)};${Math.floor(width/0.6)};${width};${Math.floor(width/1.2)}&jpeg&srcset`,
            optionsWebp: `w=${Math.floor(width/0.5)};${Math.floor(width/0.6)};${width};${Math.floor(width/1.2)}&webp&srcset`,
            sizes: `(max-width: 672px) calc(100vw - 32px), 672px`,
            id: camel,
          });

          return `{${camel}}`;
        }
      }

      return url;
    }

    // transform urls in images
    visit(tree, ["image", "definition"], (node) => {
      node.url = transformUrl(node.url);
    });

    // transform src in html nodes
    visit(tree, "html", (node) => {
      // only run on img or video elements. this is a cheap way to check it,
      // eventually we should integrate it into the RE_SRC regex.
      const isSupportedElement = node.value && node.value.match(/img|video/);

      if (isSupportedElement) {
        const [, url] = node.value.match(RE_SRC) ?? [];
        if (url) {
          const transformed = transformUrl(url);
          node.value = node.value.replace(`"${url}"`, transformed);
        }
      }
    });

    let scripts = "";
    urls.forEach((x) => (scripts += `import ${x.id}Meta from "${x.path}?${x.optionsMeta}";\n
    import ${x.id}Jpeg from "${x.path}?${x.optionsJpeg}";\n
    import ${x.id}Webp from "${x.path}?${x.optionsWebp}";\n
    const ${x.id} = {meta: ${x.id}Meta, srcsetJpeg: ${x.id}Jpeg, srcsetWebp: ${x.id}Webp};\n`));

    let is_script = false;

    visit(tree, "html", (node) => {
      if (RE_SCRIPT_START.test(node.value)) {
        is_script = true;
        node.value = node.value.replace(RE_SCRIPT_START, (script) => {
          return `${script}\n${scripts}`;
        });
      }
    });

    if (!is_script) {
      tree.children.push({
        type: "html",
        value: `<script>\n${scripts}</script>`,
      });
    }
    // console.log(scripts)
  };
}
