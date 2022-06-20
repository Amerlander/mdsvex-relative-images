// credit to pngwn doing majority of the plugin - https://github.com/pngwn/MDsveX/discussions/246#discussioncomment-720947

import { visit } from "unist-util-visit";
import toCamel from "just-camel-case";
import exifParser from "fast-exif";
// import globFs from "glob-fs";
import glob from "glob";

let defaultWidth = 1280;

const RE_SCRIPT_START =
  /<script(?:\s+?[a-zA-z]+(=(?:["']){0,1}[a-zA-Z0-9]+(?:["']){0,1}){0,1})*\s*?>/;
const RE_SRC = /src\s*=\s*"(.+?)"/;


export default function relativeImages() {
    // const processor = this;
    return async (tree, file) => {
      const promises = [];

      const urls = new Map();
      const wildcardUrls = new Map();
      const url_count = new Map();
      const folder = file.filename.substring(0, file.filename.lastIndexOf("/"));

      // transform urls in images
      visit(tree, ["image", "definition"], async function(node) {
        node.url = await transformUrl(node.url);
      });
    
      // transform src in html nodes
      visit(tree, "html", async function(node) {
        // only run on img or video elements. this is a cheap way to check it,
        // eventually we should integrate it into the RE_SRC regex.
        const isSupportedElement = node.value && node.value.match(/img|video/);
    
        if (isSupportedElement) {
          const [, url] = node.value.match(RE_SRC) ?? [];
          if (url) {
            const transformed = await transformUrl(url);
            node.value = node.value.replace(`"${url}"`, transformed);
          }
        }
      });

      await Promise.all(promises);

      let scripts = "";
      urls.forEach((x) => (scripts += `import ${x.id}Meta from "${x.path}?${x.optionsMeta}";\n
      import ${x.id}Jpeg from "${x.path}?${x.optionsJpeg}";\n
      import ${x.id}Webp from "${x.path}?${x.optionsWebp}";\n
      const ${x.id} = {meta: ${x.id}Meta, srcsetJpeg: ${x.id}Jpeg, srcsetWebp: ${x.id}Webp, exif: ${JSON.stringify(x.metaData)}};\n`));

      wildcardUrls.forEach((x) => (scripts += `const ${x.id} = {files: [${(x.fileIds).join(',')}]};\n`));
    
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

      return null;

      async function loadExifData(path) {
        const exif = await exifParser.read(path)
        return exif?.image;
      }
    
      async function transformUrl(url) {
        if (url.startsWith(".")) {
          let optionsStr;
          let plainUrl;
          
          [plainUrl, ...optionsStr] = url.split("?");
          optionsStr = optionsStr.join('?')
          let options = new URLSearchParams(optionsStr);
          let width = options.get("width") || options.get("w") || defaultWidth;
          width = (parseInt(width) > 0) ? parseInt(width) : defaultWidth;

          let filename = plainUrl.substring(plainUrl.lastIndexOf('/') + 1)
          let title = filename.slice(0, filename.lastIndexOf(".")).replace(/\[\.\.\.\d*\]/, '')
          let metaData = {width: width, title: title, url: plainUrl, description: '', artist: '', copyright: ''};

          if(url.includes('*')) {

            const fullPath = `${folder}/${plainUrl}`
            let files = glob.sync(fullPath, []);

            let fileIds = [];
            for (const file of files) {
              const fileUrl = file.replace(folder+'/', './')+`?${optionsStr}`
              const fileId = await transformUrl(fileUrl)
              fileIds.push(fileId);
            }

            const fullIdentifier = `${fullPath}?${optionsStr}`
            let camel = `_${toCamel(fullIdentifier)}`;
            const count = url_count.get(camel);
            const dupe = wildcardUrls.get(fullIdentifier);

            wildcardUrls.set(fullIdentifier, {
              fileIds: fileIds,
              id: camel
            });
    
            if (count && !dupe) {
              url_count.set(camel, count + 1);
              camel = `${camel}_${count}`;
            } else if (!dupe) {
              url_count.set(camel, 1);
            }

            return `{${camel}}`;

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
              path: `${plainUrl}`,
              optionsMeta: `w=${width}&metadata`,
              optionsJpeg: `w=${Math.floor(width)};${Math.floor(width/1.2)};${width/2};${Math.floor(width/2.4)}&jpeg&srcset`,
              optionsWebp: `w=${Math.floor(width)};${Math.floor(width/1.2)};${width/2};${Math.floor(width/2.4)}&webp&srcset`,
              id: camel,
              metaData: metaData
            });

            const p = loadExifData(`${folder}/${plainUrl}`).then((exif) => {
                if(exif){
                  metaData = {width: width, title: title, url: plainUrl, description: (exif.ImageDescription ?? ''), artist: exif.Artist ?? '', copyright: exif.Copyright ?? ''};
                  urls.set(url, {
                    ...urls.get(url),
                    metaData: metaData
                  });
                }
            });
            promises.push(p);
  
            return `{${camel}}`;
          }
        }
    
        return url;
      }



  };
}
