// ==UserScript==
// @name         Optimized Kick DGG Embed
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Enhanced DGG Kick embed with UI optimization, 1080p quality enforcement, and stream latency management
// @author       Cyclone & yuniDev & Premiumsmart
// @match        *://*.kick.com/*
// @match        https://www.destiny.gg/bigscreen*
// @match        https://destiny.gg/bigscreen*
// @grant        GM.registerMenuCommand
// @grant        GM.setValue
// @grant        GM.getValue
// @grant        GM.addStyle
// @run-at       document-start
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    const isKickEmbed = window.location.hostname === 'kick.com' && window.self !== window.top;
    const isDGG = window.location.pathname.startsWith('/bigscreen');

    if (isKickEmbed) {
        GM.addStyle(`
            #nav-main,#sidebar,aside,.main-header,#channel-content,#channel-chatroom,
            .z-controls.absolute.right-7.top-7,
            button[data-testid="video-player-clip"],
            button[data-testid="video-player-theatre-mode"]{display:none!important}

            main,.flex-grow,.flex-col{background:#000!important;padding:0!important;margin:0!important}

            #injected-channel-player,#injected-embedded-channel-player-video{
                position:fixed!important;top:0!important;left:0!important;
                width:100vw!important;height:100vh!important;
                z-index:99999!important;max-height:none!important;max-width:none!important;
                transform:translateZ(0);will-change:transform
            }

            video#video-player{
                width:100%!important;height:100%!important;
                transform:translateZ(0);will-change:transform
            }

            .z-controls.bottom-0{
                display:flex!important;opacity:1!important;
                z-index:100000!important;pointer-events:auto!important
            }

            html,body{overflow:hidden!important;background:#000!important;margin:0!important;padding:0!important}
        `);
    }

    const TARGET_KEY = 'stream_quality';
    const TARGET_VALUE = JSON.stringify(1080);

    sessionStorage.setItem(TARGET_KEY, TARGET_VALUE);

    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
        if (key === TARGET_KEY && value !== TARGET_VALUE) {
            return originalSetItem.call(this, key, TARGET_VALUE);
        }
        return originalSetItem.apply(this, arguments);
    };

    console.log("[Kick Stream Optimizer] Quality locked to 1080p");

    const targetDelay = 3;
    const speedUpFactor = 1.25;
    let playbackIntervalId = null;

    function adjustPlaybackRate() {
        const video = document.querySelector('video');

        if (!video || video.readyState < 2) {
            playbackIntervalId = setTimeout(adjustPlaybackRate, 2000);
            return;
        }

        try {
            const buffered = video.buffered;
            if (buffered.length > 0) {
                const delay = buffered.end(buffered.length - 1) - video.currentTime;
                video.playbackRate = delay > targetDelay ? speedUpFactor : 1.0;
            }
        } catch (err) {
        }

        playbackIntervalId = setTimeout(adjustPlaybackRate, 1000);
    }

    function waitForVideoAndContainer() {
        const video = document.querySelector('video');
        const container = document.querySelector('[data-testid="viewer-count"]');

        if (video && container) {
            console.log('[Kick Stream Optimizer] Stream monitoring started');
            adjustPlaybackRate();
        } else {
            setTimeout(waitForVideoAndContainer, 500);
        }
    }

    const state = {
        lastPath: '',
        insertedPlayer: null,
        observersActive: false
    };

    class KickEmbedIframeWrapper extends HTMLElement {
        constructor() {
            super();
            const shadowRoot = this.attachShadow({ mode: 'open' });
            shadowRoot.innerHTML = `
                <link rel="preconnect" href="https://kick.com">
                <link rel="dns-prefetch" href="https://kick.com">
                <iframe
                    is="x-frame-bypass"
                    style="width:100%;height:100%;border:none;transform:translateZ(0)"
                    class="embed-frame"
                    src=""
                    allow="autoplay; fullscreen; encrypted-media; picture-in-picture; web-share"
                    allowfullscreen
                    loading="eager"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation">
                </iframe>
            `;
            this.iframe = shadowRoot.querySelector('iframe');
        }

        static get observedAttributes() {
            return ['src'];
        }

        connectedCallback() {
            this.updateSrc();
        }

        attributeChangedCallback(name, oldValue, newValue) {
            if (name === 'src' && oldValue !== newValue) {
                this.updateSrc();
            }
        }

        updateSrc() {
            const src = this.getAttribute('src');
            if (src && this.iframe && this.iframe.src !== src) {
                this.iframe.src = src;
            }
        }
    }

    if (isDGG) {
        customElements.define('kick-embed-iframe-wrapper', KickEmbedIframeWrapper);
    }

    function htmlToNode(html) {
        const template = document.createElement('template');
        template.innerHTML = html.trim();
        return template.content.firstChild;
    }

    function addObserver(selector, callback = el => { el.style.display = 'none'; }) {
        const element = document.querySelector(selector);
        if (element) {
            callback(element);
            return;
        }

        const observer = new MutationObserver((_, obs) => {
            const el = document.querySelector(selector);
            if (el) {
                callback(el);
                obs.disconnect();
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        setTimeout(() => observer.disconnect(), 10000);
    }

    function extractChannel(iframeLocation) {
        if (iframeLocation.includes('player.kick')) {
            return iframeLocation.split('/').pop();
        }
        if (window.location.hash.startsWith('#kick/')) {
            return window.location.hash.split('/')[1];
        }
        return null;
    }

    function buildKickUrl(channel) {
        return `https://kick.com/${channel}?autoplay=true`;
    }

    function hideSurroundings() {
        const selectors = [
            { sel: '[data-sidebar]', cb: el => {
                el.setAttribute('data-sidebar', 'false');
                el.setAttribute('data-theatre', 'true');
                el.setAttribute('data-chat', 'false');
            }},
            { sel: '.z-controls.hidden button', cb: el => { el.parentNode.style.display = 'none'; }},
            { sel: '#channel-chatroom > div:first-child' },
            { sel: '#channel-content' },
            { sel: '.z-modal:has(button[data-testid="accept-cookies"])' },
            { sel: 'button[data-testid="mature"]', cb: btn => btn.click() }
        ];

        selectors.forEach(({ sel, cb }) => addObserver(sel, cb));
    }

    function fixVideoPlayer() {
        const processedVideos = new WeakSet();
        const playAttempts = new WeakMap();

        const videoObserver = new MutationObserver(() => {
            const videos = document.querySelectorAll('video');
            videos.forEach(video => {
                if (processedVideos.has(video)) return;
                processedVideos.add(video);

                video.autoplay = true;
                video.playsInline = true;

                let playTimeout;
                const attemptPlay = (reason = 'unknown') => {
                    clearTimeout(playTimeout);
                    playTimeout = setTimeout(() => {
                        if (video.readyState >= 2 && !video.seeking && !video.ended) {
                            if (!video.paused) return;

                            const attempts = playAttempts.get(video) || 0;

                            if (attempts > 10) {
                                console.warn('[Kick Embed] Max play attempts reached, backing off');
                                playAttempts.delete(video);
                                return;
                            }

                            playAttempts.set(video, attempts + 1);

                            video.play()
                                .then(() => {
                                    playAttempts.delete(video);
                                })
                                .catch(err => {
                                    if (!err.message.includes('aborted')) {
                                        console.log(`[Kick Embed] Play failed (${reason}):`, err.message);
                                    }
                                });
                        }
                    }, 100);
                };

                video.addEventListener('pause', (e) => {
                    if (e.isTrusted && video.currentTime > 0) return;

                    if (video.readyState >= 2 && !video.seeking && !video.ended) {
                        attemptPlay('pause');
                    }
                }, { passive: true });

                const recoveryHandler = () => attemptPlay('buffering');
                video.addEventListener('waiting', recoveryHandler, { passive: true, once: false });

                setTimeout(() => {
                    if (video.paused && video.readyState >= 2) {
                        attemptPlay('initial');
                    }
                }, 500);
            });
        });

        videoObserver.observe(document.body, {
            childList: true,
            subtree: true
        });

        setTimeout(() => {
            document.querySelectorAll('video').forEach(v => {
                if (v.paused && v.readyState >= 2) {
                    v.play().catch(() => {});
                }
            });
        }, 1000);
    }

    function initKickEmbed() {
        hideSurroundings();
        fixVideoPlayer();

        let lastResize = 0;
        const resizeInterval = setInterval(() => {
            const now = Date.now();
            if (now - lastResize < 900) return;
            lastResize = now;

            const player = document.getElementById('injected-channel-player');
            if (player) {
                let parent = player.parentElement;
                while (parent && parent.tagName !== 'BODY') {
                    Array.from(parent.children).forEach(child => {
                        if (!child.contains(player)) {
                            child.style.display = 'none';
                        }
                    });
                    parent = parent.parentElement;
                }
            }
            window.dispatchEvent(new Event('resize'));
        }, 1000);

        const navCheckInterval = setInterval(() => {
            if (document.querySelector('nav:not([style*="display: none"])')) {
                hideSurroundings();
            }
        }, 200);

        return () => {
            clearInterval(resizeInterval);
            clearInterval(navCheckInterval);
        };
    }

    function updateEmbed() {
        if (state.insertedPlayer) return;

        const iframe = document.querySelector('iframe.embed-frame');
        if (!iframe) return;

        const channel = extractChannel(iframe.src);
        if (!channel) return;

        const kickUrl = buildKickUrl(channel);

        state.insertedPlayer = htmlToNode(
            `<kick-embed-iframe-wrapper
                class="embed-frame"
                style="display:block"
                src="${kickUrl}">
            </kick-embed-iframe-wrapper>`
        );

        iframe.parentNode.appendChild(state.insertedPlayer);
    }

    function loadDGG() {
        const script = htmlToNode(
            '<script type="module" src="https://unpkg.com/x-frame-bypass"></script>'
        );
        document.head.appendChild(script);

        const embedContainer = document.getElementById('embed');
        if (!embedContainer) {
            console.warn('Embed container not found');
            return () => {};
        }

        const embedObserver = new MutationObserver(mutations => {
            for (const mutation of mutations) {
                if (mutation.type !== 'childList') continue;

                for (const node of mutation.addedNodes) {
                    if (
                        node.nodeType === Node.ELEMENT_NODE &&
                        node.tagName === 'IFRAME' &&
                        node.classList.contains('embed-frame')
                    ) {
                        updateEmbed();
                    }
                }
            }

            if (state.lastPath === window.location.href) {
                const iframe = document.querySelector('iframe.embed-frame');
                if (
                    iframe &&
                    iframe.src !== 'about:blank?player.kick' &&
                    iframe.src.includes('player.kick')
                ) {
                    iframe.src = 'about:blank?player.kick';
                }
            }
        });

        embedObserver.observe(embedContainer, {
            childList: true,
            subtree: true,
            attributes: true
        });

        updateEmbed();

        return () => embedObserver.disconnect();
    }

    function initDGG() {
        let disconnect = loadDGG();
        state.lastPath = window.location.href;

        const handleHashChange = () => {
            setTimeout(() => {
                disconnect();
                state.insertedPlayer?.remove();
                state.insertedPlayer = null;
                state.lastPath = window.location.href;
                disconnect = loadDGG();
            }, 1);
        };

        window.addEventListener('hashchange', handleHashChange);

        GM.addStyle('iframe[src*="player.kick"].embed-frame{display:none!important}');
    }

    function init() {
        waitForVideoAndContainer();

        if (isKickEmbed) {
            initKickEmbed();
        } else if (isDGG) {
            initDGG();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true, passive: true });
    } else {
        init();
    }

})();
