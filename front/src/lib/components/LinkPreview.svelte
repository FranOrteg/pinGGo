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
    faviconFailed = false;
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

  function isFacebookPreview(p) {
    const d = (p?.domain || "").toLowerCase();
    return d === "facebook.com" || d.endsWith(".facebook.com") || d === "fb.com" || d.endsWith(".fb.com");
  }
</script>

{#if preview}
  <div
    class="link-preview"
    class:link-preview--youtube={!!preview.videoId}
    class:link-preview--facebook={isFacebookPreview(preview)}
  >
    {#if preview.videoId && playing}
      <div class="link-preview__card link-preview__card--playing">
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
    margin-top: 10px;
    margin-bottom: 8px;
    width: 100%;
    max-width: 500px;
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
    outline: none;
    transition: border-color 0.15s ease-out, background 0.15s ease-out;
  }
  .link-preview__card:hover {
    border-color: var(--color-surface-hover);
    background: var(--color-hover);
  }
  .link-preview__card:focus-visible {
    outline: 1px solid var(--color-accent);
    outline-offset: -1px;
  }

  /* Playing and loading states aren't whole-card actions — keep them static. */
  .link-preview__card--playing,
  .link-preview__card--loading {
    cursor: default;
  }
  .link-preview__card--playing:hover,
  .link-preview__card--loading:hover {
    border-color: var(--color-border);
    background: var(--color-surface);
  }

  .link-preview__media {
    position: relative;
    aspect-ratio: 16 / 9;
    background: var(--color-hover);
    border-bottom: 1px solid var(--color-border);
  }
  .link-preview__thumb {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  /* Facebook og:images are square — keep the thumbnail compact, not a 16:9 block. */
  .link-preview--facebook .link-preview__media {
    aspect-ratio: auto;
    height: 280px;
  }

  .link-preview__play {
    position: absolute;
    inset: 0;
    margin: auto;
    width: 50px;
    height: 50px;
    border-radius: 50%;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-overlay);
    color: var(--color-btn-text);
    box-shadow: 0 0 0 1px var(--color-border), 0 4px 12px var(--color-card-shadow);
    backdrop-filter: blur(2px);
    transition: background 0.15s ease-out, box-shadow 0.15s ease-out, transform 0.15s ease-out;
  }
  .link-preview__play:hover {
    background: var(--color-accent);
    box-shadow: 0 0 0 1px var(--color-accent), 0 4px 14px var(--color-card-shadow);
    transform: scale(1.05);
  }
  .link-preview__play:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
  .link-preview__play svg {
    width: 22px;
    height: 22px;
    margin-left: 3px;
  }

  .link-preview__body {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px 14px 13px;
    min-width: 0;
  }
  .link-preview__meta {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 500;
    color: var(--color-text-muted);
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
    transition: opacity 0.15s ease-out;
  }
  .link-preview__card:hover .link-preview__open-icon {
    opacity: 1;
  }
  .link-preview__open-icon svg {
    width: 13px;
    height: 13px;
  }
  .link-preview__title {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    line-height: 1.4;
    color: var(--color-text);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    line-clamp: 2;
    overflow: hidden;
    word-break: ellipsis;
  }
  .link-preview__description {
    margin: 0;
    font-size: 12px;
    line-height: 1.4;
    color: var(--color-text-muted);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    line-clamp: 2;
    overflow: hidden;
    word-break:ellipsis;
  }

  /* YouTube cards end at the title — no description or trailing URL footer. */
  .link-preview--youtube .link-preview__description
  {
    display: none;
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
    padding: 8px 14px;
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
    background: var(--color-hover);
  }
  .link-preview__action-link svg {
    width: 13px;
    height: 13px;
  }

  /* ── Loading skeleton ── */
  .link-preview__skeleton {
    background: var(--color-hover);
    border-radius: 4px;
    position: relative;
    overflow: hidden;
  }
  .link-preview__skeleton::after {
    content: "";
    position: absolute;
    inset: 0;
    transform: translateX(-100%);
    background: linear-gradient(90deg, transparent, var(--color-hover-strong), transparent);
    animation: link-preview-shimmer 1.4s infinite;
  }
  .link-preview__skeleton--thumb {
    aspect-ratio: 16 / 9;
    height: auto;
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

  @media (max-width: 560px) {
    .link-preview {
      max-width: 100%;
    }
  }
</style>
