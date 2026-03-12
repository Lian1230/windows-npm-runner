import '@xterm/xterm/css/xterm.css';
import { mount } from 'svelte';
import App from './App.svelte';

mount(App, { target: document.getElementById('svelte-root') });

// Run terminal/tab bridge after DOM is ready (sets up window.* and IPC).
await import('./runner.js');
