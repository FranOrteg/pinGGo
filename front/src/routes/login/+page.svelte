<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { login, register, isAuthenticated, authReady } from '$lib/stores/auth.js';
  import pinggoLogo from '$lib/assets/pinggoLogo.png';

  let mode = 'login';
  let email = '';
  let password = '';
  let username = '';
  let error = '';
  let loading = false;

  onMount(() => {
    let unsub;
    unsub = authReady.subscribe((ready) => {
      if (ready && $isAuthenticated) {
        if (unsub) unsub();
        goto('/chat', { replaceState: true });
      }
    });
    return () => { if (unsub) unsub(); };
  });

  async function handleSubmit() {
    error = '';
    loading = true;
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        if (username.length < 2) throw new Error('Username must be at least 2 characters');
        await register(username, email, password);
      }
      goto('/chat');
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }
</script>

<div class="auth-page">
  <div class="auth-card">
    <div class="auth-logo">
      <span class="logo-name">PinGGo</span>
    </div>

    <div class="auth-tabs">
      <button class:active={mode === 'login'} on:click={() => { mode = 'login'; error = ''; }}>
        Sign In
      </button>
      <button class:active={mode === 'register'} on:click={() => { mode = 'register'; error = ''; }}>
        Create Account
      </button>
    </div>

    {#if error}
      <div class="auth-error" role="alert">{error}</div>
    {/if}

    <form on:submit|preventDefault={handleSubmit}>
      {#if mode === 'register'}
        <div class="field">
          <label for="username">Username</label>
          <input
            id="username"
            bind:value={username}
            placeholder="your_username"
            autocomplete="username"
            minlength="2"
            required
          />
        </div>
      {/if}

      <div class="field">
        <label for="email">Email</label>
        <input
          id="email"
          type="email"
          bind:value={email}
          placeholder="you@example.com"
          autocomplete="email"
          required
        />
      </div>

      <div class="field">
        <label for="password">Password</label>
        <input
          id="password"
          type="password"
          bind:value={password}
          placeholder="••••••••"
          autocomplete={mode === 'login' ? 'current-password' : 'new-password'}
          minlength="8"
          required
        />
      </div>

      <button type="submit" class="btn-submit" disabled={loading}>
        {#if loading}
          <span class="btn-spinner"></span>
          {mode === 'login' ? 'Signing in…' : 'Creating account…'}
        {:else}
          {mode === 'login' ? 'Sign In' : 'Create Account'}
        {/if}
      </button>
    </form>
  </div>
</div>

<style>
  .auth-page {
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-bg);
    padding: 16px;
  }

  .auth-card {
    width: 100%;
    max-width: 400px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 12px;
    padding: 36px 32px;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .auth-logo {
    display: flex;
    align-items: center;
    gap: 10px;
    justify-content: center;
  }
  .logo-name {
    font-size: 24px;
    font-weight: 700;
    color: var(--color-text);
    letter-spacing: -0.5px;
  }

  .auth-tabs {
    display: flex;
    background: var(--color-bg);
    border-radius: 8px;
    padding: 3px;
  }
  .auth-tabs button {
    flex: 1;
    padding: 8px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--color-text-muted);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }
  .auth-tabs button.active {
    background: var(--color-surface);
    color: var(--color-text);
    box-shadow: 0 1px 3px rgba(0,0,0,0.3);
  }

  .auth-error {
    background: rgba(224, 90, 78, 0.12);
    border: 1px solid rgba(224, 90, 78, 0.4);
    color: #e05a4e;
    border-radius: 6px;
    padding: 10px 14px;
    font-size: 13px;
  }

  form { display: flex; flex-direction: column; gap: 16px; }

  .field { display: flex; flex-direction: column; gap: 6px; }
  .field label { font-size: 13px; font-weight: 500; color: var(--color-text-muted); }
  .field input {
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: 6px;
    padding: 10px 12px;
    color: var(--color-text);
    font-size: 14px;
    transition: border-color 0.15s;
    outline: none;
  }
  .field input:focus { border-color: var(--color-accent); }

  .btn-submit {
    background: var(--color-accent);
    color: #fff;
    border: none;
    border-radius: 6px;
    padding: 11px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition: opacity 0.15s;
    margin-top: 4px;
  }
  .btn-submit:disabled { opacity: 0.6; cursor: not-allowed; }
  .btn-submit:hover:not(:disabled) { opacity: 0.9; }

  .btn-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255,255,255,0.4);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
