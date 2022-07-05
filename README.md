# mdsvex-relative-images

Allows you to use relative urls to images from the md file.

# Usage

```
npm install mdsvex-relative-images
```

Add the plugin to your mdsvex config

```js
// mdsvex.config.js
import relativeImages from "mdsvex-relative-images";

export default {
  // ... rest of your config
  remarkPlugins: [relativeImages],
};
```

Now you can load images like so:

```md
![my image](./my-image.png)
```

It also works for img and video tags:

```svelte
<img src="./my-image.png" />
<video src="./my-video.mp4" />
```

# Import all files in a folder

Create a layout file for replacing your img tags (or video tags)
```svelte
// mdsvex_layout_file.svelte
<script context="module">
    import img from '$lib/mdsvex/img.svelte';
    export { img };
</script>

<slot />
```

Create your tag component, multiple files are passed as object. You could also use an image processor like svelte-image.
```svelte
// lib/mdsvex/img.svelte
<script>
    export let src;
    export let alt;
    let srces;

    if(typeof src === 'object') {
        console.log(src)
        srces = Object.entries(src).map(x => x[1].default)
    }
</script>

{#if typeof src === 'string'}
    <img {src} {alt} {...$$restProps} />
{:else if typeof srces === 'object'}
    <h2>{alt}</h2>
    {#each srces as src}
        <img {src} {alt} {...$$restProps} />
    {/each}
{/if}
```

Now a Path containing a `*`...
```md
![My Images](./images/*.{jpg,jpeg,png})
```

… might result in this:
```html
<h2>My Images</h2>
<img src="/src/content/images/1.jpeg" alt="My Images">
<img src="/src/content/images/anotherImage.jpeg" alt="My Images">
<img src="/src/content/images/3.jpeg" alt="My Images">
```

**Todo**
- find out how to pass image describptions and alt tags from file meta or filename to the component.
