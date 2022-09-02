// credit to pngwn doing majority of the plugin - https://github.com/pngwn/MDsveX/discussions/246#discussioncomment-720947

import { visit } from "unist-util-visit";
import toCamel from "just-camel-case";
import exifParser from "fast-exif";
// import globFs from "glob-fs";
import glob from "glob";

const defaultWidth = 1280;
const defaultHeight = 'auto';

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
      urls.forEach((x) => {
        scripts += `import ${x.id}Meta from "${x.path}?${x.optionsMeta}";\n`
        scripts += `import ${x.id}Jpeg from "${x.path}?${x.optionsJpeg}";\n`
        scripts += `import ${x.id}Webp from "${x.path}?${x.optionsWebp}";\n`
        scripts += `const ${x.id} = {meta: ${x.id}Meta, srcsetJpeg: ${x.id}Jpeg, srcsetWebp: ${x.id}Webp, exif: ${JSON.stringify(x.metaData)}, options: ${JSON.stringify(x.options)}};\n`
        return scripts;
      });

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

      return null;

      async function loadExifData(path) {
        const exif = await exifParser.read(path)
        return exif?.image;
      }
    
      async function transformUrl(url) {
        if (url.startsWith(".")) {
          let optionsStr;
          let optionsArr;
          let optionsObj;
          let plainUrl;
          
          [plainUrl, ...optionsArr] = url.split("|");
          optionsObj = Object.fromEntries(optionsArr.map(e => e.split("=")))
          optionsStr = optionsArr.join('|')

          let width = optionsObj.width || optionsObj.w || defaultWidth;
          let height = optionsObj.height || optionsObj.h || defaultHeight;

          if(width != 'auto')
            width = (parseInt(width) > 0) ? parseInt(width) : defaultWidth;

          if(height != 'auto')
            height = (parseInt(height) > 0) ? parseInt(height) : defaultHeight;

          let filename = plainUrl.substring(plainUrl.lastIndexOf('/') + 1)
          let title = filename.slice(0, filename.lastIndexOf(".")).replace(/\[\.\.\.\d*\]/, '')
          let metaData = {width: width, height: height, title: title, url: plainUrl, description: '', artist: '', copyright: ''};

          if(url.includes('*')) {

            const fullPath = `${folder}/${plainUrl}`.replace('/./', '/')
            let files = glob.sync(plainUrl, {cwd: folder});

            let fileIds = [];
            for (const file of files) {
              const fileUrl = file.replace(folder+'/', './')+`|${optionsStr}`
              const fileId = await transformUrl(fileUrl)
              fileIds.push(fileId);
            }

            const fullIdentifier = `${fullPath}${optionsStr}`
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

            let sizeStr
            let sizesStr

            if(height === 'auto' && width === 'auto') {
              sizeStr = ``
              sizesStr = ``
            } else if(height === 'auto') {
              sizeStr = `w=${width}`
              sizesStr = `w=${Math.floor(width)};${Math.floor(width/1.2)};${width/2};${Math.floor(width/2.4)}`
            } else if (width === 'auto'){
              sizeStr = `h=${height}`
              sizesStr = `h=${Math.floor(height)};${Math.floor(height/1.2)};${height/2};${Math.floor(height/2.4)}`
            } else {
              sizeStr = `w=${width}&h=${height}`
              sizesStr = `w=${Math.floor(width)};${Math.floor(width/1.2)};${width/2};${Math.floor(width/2.4)}&h=${Math.floor(height)};${Math.floor(height/1.2)};${height/2};${Math.floor(height/2.4)}`
            }

            let filetypeA = (filename.split(".").pop().toLowerCase() == 'gif') ? 'apng' : 'jpg';

            urls.set(url, {
              path: `${plainUrl}`,
              optionsMeta: `${sizeStr}&${filetypeA}&metadata`,
              optionsJpeg: `${sizesStr}&${filetypeA}&srcset`,
              optionsWebp: `${sizesStr}&webp&srcset`,
              id: camel,
              metaData: metaData,
              options: optionsObj
            });

            const p = loadExifData(`${folder}/${plainUrl}`).then((exif) => {
                if(exif){
                  metaData = {width: width, height: height, title: title, url: plainUrl, description: (exif.ImageDescription ?? ''), artist: exif.Artist ?? '', copyright: exif.Copyright ?? ''};
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
