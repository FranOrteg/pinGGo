<script>
  import { getLinkPreview } from "$lib/api/preview.js";

  export let url;

  let preview = null;
  let loading = false;
  let playing = false;
  let faviconFailed = false;
  let loadedUrl = null;

  $: if (url && url !== loadedUrl) loadPreview(url);

  async function loadPreview(u) {
    loadedUrl = u;
    loading = true;
    preview = null;
    playing = false;
    preview = await getLinkPreview(u);
    loading = false;
  }

  function openUrl() {
    if (!preview) return;
    window.open(preview.canonicalUrl || url, "_blank", "noopener");
  }

  function handleCardKeydown(e) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openUrl();
    }
  }

  function startPlay() {
    playing = true;
  }

  function onFaviconError() {
    faviconFailed = true;
  }
</script>

{#if preview}
  <div
    class="link-preview"
    class:link-preview--youtube={!!preview.videoId}
  >
    {#if preview.videoId && playing}
      <div class="link-preview__embed">
        <iframe
          src="{preview.embedUrl}?autoplay=1"
          title="YouTube video player"
          frameborder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowfullscreen
          loading="lazy"
        ></iframe>
      </div>
      <div class="link-preview__actions">
        <a
          href={preview.canonicalUrl || url}
          target="_blank"
          rel="noopener noreferrer"
          class="link-preview__action-link"
        >
          Abrir en YouTube
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h7v7M13 3L5 11M8 13H4a1 1 0 01-1-1V8"/></svg>
        </a>
      </div>
    {:else}
      <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
      <div
        class="link-preview__card"
        role="button"
        tabindex="0"
        on:click={openUrl}
        on:keydown={handleCardKeydown}
        aria-label="Abrir {preview.canonicalUrl || url}"
      >
        {#if preview.image}
          <div class="link-preview__media">
            <img
              src={preview.image}
              alt=""
              loading="lazy"
              class="link-preview__thumb"
            />
            {#if preview.videoId}
              <button
                type="button"
                class="link-preview__play"
                on:click|stopPropagation={startPlay}
                aria-label="Reproducir en el chat"
                title="Reproducir en el chat"
              >
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              </button>
            {/if}
          </div>
        {/if}
        <div class="link-preview__body">
          <div class="link-preview__meta">
            {#if preview.favicon && !faviconFailed}
              <img
                src={preview.favicon}
                alt=""
                class="link-preview__favicon"
                on:error={onFaviconError}
              />
            {/if}
            <span class="link-preview__provider">{preview.provider || preview.domain}</span>
            <span class="link-preview__open-icon" aria-hidden="true">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h7v7M13 3L5 11M8 13H4a1 1 0 01-1-1V8"/></svg>
            </span>
          </div>
          {#if preview.title}
            <h4 class="link-preview__title">{preview.title}</h4>
          {/if}
          {#if preview.description}
            <p class="link-preview__description">{preview.description}</p>
          {/if}
          <span class="link-preview__url">{preview.canonicalUrl || url}</span>
        </div>
      </div>
    {/if}
  </div>
{:else if loading}
  <div class="link-preview" aria-hidden="true">
    <div class="link-preview__card link-preview__card--loading">
      <div class="link-preview__skeleton link-preview__skeleton--thumb"></div>
      <div class="link-preview__body">
        <div class="link-preview__skeleton link-preview__skeleton--line"></div>
        <div class="link-preview__skeleton link-preview__skeleton--line"></div>
        <div class="link-preview__skeleton link-preview__skeleton--line-short"></div>
      </div>
    </div>
  </div>
{/if}

<style>
  .link-preview {
    margin-top: 6px;
    max-width: 360px;
  }

  /* ── Card ── */
  .link-preview__card {
    display: flex;
    flex-direction: column;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    overflow: hidden;
    cursor: pointer;
    color: var(--color-text);
    text-align: left;
    font: inherit;
    transition: border-color 0.15s ease-out;
    outline: none;
  }
  .link-preview__card:hover {
    border-color: rgba(255, 255, 255, 0.22);
  }
  .link-preview__card:focus-visible {
    outline: 1px solid var(--color-accent);
    outline-offset: -1px;
  }

  .link-preview__media {
    position: relative;
    border-bottom: 1px solid var(--color-border);
    background: rgba(255, 255, 255, 0.02);
  }
  .link-preview__thumb {
    display: block;
    width: 100%;
    height: 150px;
    object-fit: cover;
  }

  .link-preview__play {
    position: absolute;
    inset: 0;
    margin: auto;
    width: 46px;
    height: 46px;
    border-radius: 50%;
    border: none;
    background: rgba(0, 0, 0, 0.6);
    color: #fff;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s ease-out, transform 0.15s ease-out;
  }
  .link-preview__play:hover {
    background: var(--color-accent);
    transform: scale(1.06);
  }
  .link-preview__play svg {
    width: 20px;
    height: 20px;
    margin-left: 2px;
  }

  .link-preview__body {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 10px 12px 11px;
    min-width: 0;
  }
  .link-preview__meta {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--color-text-muted);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .link-preview__favicon {
    width: 14px;
    height: 14px;
    border-radius: 3px;
    object-fit: contain;
    flex-shrink: 0;
  }
  .link-preview__provider {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .link-preview__open-icon {
    margin-left: auto;
    display: flex;
    opacity: 0.6;
  }
  .link-preview__open-icon svg {
    width: 13px;
    height: 13px;
  }
  .link-preview__title {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    line-height: 1.35;
    color: var(--color-text);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    word-break: break-word;
  }
  .link-preview__description {
    margin: 0;
    font-size: 12px;
    line-height: 1.4;
    color: var(--color-text-muted);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    word-break: break-word;
  }
  .link-preview__url {
    margin-top: 2px;
    font-size: 11px;
    color: var(--color-text-muted);
    opacity: 0.75;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* ── YouTube embed ── */
  .link-preview__embed {
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 9;
    background: #000;
  }
  .link-preview__embed iframe {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border: 0;
  }
  .link-preview__actions {
    display: flex;
    justify-content: flex-end;
    padding: 8px 12px;
    border-top: 1px solid var(--color-border);
  }
  .link-preview__action-link {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    font-weight: 500;
    color: var(--color-accent);
    text-decoration: none;
    border-radius: 4px;
    padding: 2px 4px;
    transition: background 0.15s ease-out;
  }
  .link-preview__action-link:hover {
    background: rgba(255, 255, 255, 0.06);
  }
  .link-preview__action-link svg {
    width: 13px;
    height: 13px;
  }

  /* ── Loading skeleton ── */
  .link-preview__card--loading {
    cursor: default;
  }
  .link-preview__skeleton {
    background: rgba(255, 255, 255, 0.06);
    border-radius: 4px;
    position: relative;
    overflow: hidden;
  }
  .link-preview__skeleton::after {
    content: "";
    position: absolute;
    inset: 0;
    transform: translateX(-100%);
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.08), transparent);
    animation: link-preview-shimmer 1.4s infinite;
  }
  .link-preview__skeleton--thumb {
    height: 150px;
    border-radius: 0;
  }
  .link-preview__skeleton--line {
    height: 10px;
  }
  .link-preview__skeleton--line-short {
    height: 10px;
    width: 55%;
  }
  @keyframes link-preview-shimmer {
    to {
      transform: translateX(100%);
    }
  }
</style>
