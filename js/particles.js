/**
 * TriggerForge - Interactive Particle System
 * Canvas-based particles with mouse interaction
 */

(function() {
    'use strict';

    // Configuration
    const CONFIG = {
        particleCount: 20,
        particleCountMobile: 5,
        colors: [
            // Orange family
            { r: 179, g: 90, b: 0 },     // Dark Orange #B35A00
            { r: 253, g: 125, b: 0 },    // Orange #FD7D00
            { r: 255, g: 179, b: 102 },  // Light Orange #FFB366
            // Teal family
            { r: 1, g: 46, b: 45 },      // Dark Teal #012E2D
            { r: 1, g: 83, b: 81 },      // Teal #015351
            { r: 10, g: 186, b: 181 }    // Light Teal #0ABAB5
        ],
        minSize: 1,
        maxSize: 3,
        minSpeed: 0.1,
        maxSpeed: 0.4,
        minOpacity: 0.15,
        maxOpacity: 0.6,
        glowSize: 18,
        mouseRadius: 150,
        mouseForce: 0.8,
        returnSpeed: 0.02
    };

    // Appearance presets — pick one via body[data-particles="…"].
    // 'standard' matches the legacy defaults; 'minimal' is calmer (fewer
    // + dimmer); 'off' stops the canvas entirely.
    const PRESETS = {
        standard: { desktop: 20, mobile: 5, opacityMul: 1 },
        minimal:  { desktop: 8,  mobile: 3, opacityMul: 0.5 },
        off:      { desktop: 0,  mobile: 0, opacityMul: 1 }
    };
    function applyPreset(name) {
        const p = PRESETS[name] || PRESETS.standard;
        CONFIG.particleCount = p.desktop;
        CONFIG.particleCountMobile = p.mobile;
        CONFIG.minOpacity = 0.15 * p.opacityMul;
        CONFIG.maxOpacity = 0.6 * p.opacityMul;
        if (!initialized) {
            if (p.desktop > 0 || p.mobile > 0) init();
            return;
        }
        if (p.desktop === 0 && p.mobile === 0) {
            // Drop to zero particles — cheaper than tearing the canvas
            // down entirely and we stay ready to re-populate on preset
            // change.
            particles = [];
        } else {
            createParticles();
        }
    }

    // State
    let canvas, ctx;
    let particles = [];
    let mouse = { x: null, y: null };
    let animationId;
    let isReducedMotion = false;
    let debouncedResize = null;
    let initialized = false;

    /**
     * Particle Class
     */
    class Particle {
        constructor() {
            this.reset();
        }

        reset() {
            this.x = Math.random() * window.innerWidth;
            this.y = Math.random() * window.innerHeight;
            this.baseX = this.x;
            this.baseY = this.y;
            
            // Random velocity
            const angle = Math.random() * Math.PI * 2;
            const speed = CONFIG.minSpeed + Math.random() * (CONFIG.maxSpeed - CONFIG.minSpeed);
            this.vx = Math.cos(angle) * speed;
            this.vy = Math.sin(angle) * speed;
            
            // Random size
            this.size = CONFIG.minSize + Math.random() * (CONFIG.maxSize - CONFIG.minSize);
            
            // Random color (orange or teal)
            this.color = CONFIG.colors[Math.floor(Math.random() * CONFIG.colors.length)];
            
            // Random opacity
            this.opacity = CONFIG.minOpacity + Math.random() * (CONFIG.maxOpacity - CONFIG.minOpacity);
            this.baseOpacity = this.opacity;
            
            // For mouse interaction
            this.dx = 0;
            this.dy = 0;
        }

        update() {
            // Normal movement
            this.baseX += this.vx;
            this.baseY += this.vy;

            // Wrap around edges (logical CSS-pixel bounds, not the scaled
            // canvas.width/height which are in physical device pixels).
            const w = window.innerWidth;
            const h = window.innerHeight;
            if (this.baseX < -10) this.baseX = w + 10;
            if (this.baseX > w + 10) this.baseX = -10;
            if (this.baseY < -10) this.baseY = h + 10;
            if (this.baseY > h + 10) this.baseY = -10;

            // Mouse interaction
            if (mouse.x !== null && mouse.y !== null) {
                const dx = this.baseX - mouse.x;
                const dy = this.baseY - mouse.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < CONFIG.mouseRadius) {
                    // Calculate push force (stronger when closer)
                    const force = (CONFIG.mouseRadius - distance) / CONFIG.mouseRadius;
                    const angle = Math.atan2(dy, dx);

                    // Push particle away from mouse
                    this.dx += Math.cos(angle) * force * CONFIG.mouseForce * 2;
                    this.dy += Math.sin(angle) * force * CONFIG.mouseForce * 2;

                    // Increase opacity when near mouse (glow effect)
                    this.opacity = Math.min(1, this.baseOpacity + force * 0.5);
                } else {
                    // Return opacity to normal
                    this.opacity += (this.baseOpacity - this.opacity) * 0.05;
                }
            } else {
                // Mouse is outside the viewport — still ease opacity back
                // to base, otherwise particles lit up by a prior hover stay
                // permanently boosted until the cursor returns.
                this.opacity += (this.baseOpacity - this.opacity) * 0.05;
            }

            // Apply displacement and gradually return
            this.x = this.baseX + this.dx;
            this.y = this.baseY + this.dy;
            
            // Dampen displacement (return to base position)
            this.dx *= 0.92;
            this.dy *= 0.92;
        }

        draw() {
            const glowRadius = this.size * CONFIG.glowSize;
            
            // Create radial gradient for soft glow effect
            const gradient = ctx.createRadialGradient(
                this.x, this.y, 0,
                this.x, this.y, glowRadius
            );
            
            // Ultra soft, very gradual fade from center to edge
            gradient.addColorStop(0, `rgba(${this.color.r}, ${this.color.g}, ${this.color.b}, ${this.opacity * 0.5})`);
            gradient.addColorStop(0.05, `rgba(${this.color.r}, ${this.color.g}, ${this.color.b}, ${this.opacity * 0.4})`);
            gradient.addColorStop(0.15, `rgba(${this.color.r}, ${this.color.g}, ${this.color.b}, ${this.opacity * 0.25})`);
            gradient.addColorStop(0.3, `rgba(${this.color.r}, ${this.color.g}, ${this.color.b}, ${this.opacity * 0.12})`);
            gradient.addColorStop(0.5, `rgba(${this.color.r}, ${this.color.g}, ${this.color.b}, ${this.opacity * 0.05})`);
            gradient.addColorStop(0.7, `rgba(${this.color.r}, ${this.color.g}, ${this.color.b}, ${this.opacity * 0.02})`);
            gradient.addColorStop(1, `rgba(${this.color.r}, ${this.color.g}, ${this.color.b}, 0)`);
            
            ctx.beginPath();
            ctx.arc(this.x, this.y, glowRadius, 0, Math.PI * 2);
            ctx.fillStyle = gradient;
            ctx.fill();
        }
    }

    /**
     * Initialize canvas and particles
     */
    function init() {
        if (initialized) return;

        // Check for reduced motion preference
        isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (isReducedMotion) return;

        // Honour the persisted particles preset up-front so we don't
        // create a 20-particle field that applyPreset immediately tears
        // down when app.js applies the user's 'minimal' or 'off' choice.
        let presetName = 'standard';
        try {
            const raw = localStorage.getItem('triggerforge_settings');
            if (raw) {
                const s = JSON.parse(raw);
                if (s && typeof s.particles === 'string' && PRESETS[s.particles]) {
                    presetName = s.particles;
                }
            }
        } catch (e) { /* localStorage unavailable — fall back to standard */ }
        const p0 = PRESETS[presetName];
        CONFIG.particleCount = p0.desktop;
        CONFIG.particleCountMobile = p0.mobile;
        CONFIG.minOpacity = 0.15 * p0.opacityMul;
        CONFIG.maxOpacity = 0.6 * p0.opacityMul;
        // Even for the 'off' preset, set up the canvas + animate loop
        // with zero particles. Empty array is ~free to loop, and leaves
        // the door open for applyPreset('standard') later to produce a
        // visible field without having to redo full init.

        canvas = document.getElementById('particle-canvas');
        if (!canvas) return;

        ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Set canvas size
        resizeCanvas();

        // Create particles
        createParticles();

        // Event listeners
        debouncedResize = debounce(handleResize, 250);
        window.addEventListener('resize', debouncedResize);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseleave', handleMouseLeave);
        // All touch listeners are passive — we only read coordinates, never
        // preventDefault. Non-passive touch listeners block scrolling for up
        // to 100 ms while the browser waits to see if we'll cancel.
        window.addEventListener('touchmove', handleTouchMove, { passive: true });
        window.addEventListener('touchend', handleTouchEnd, { passive: true });
        window.addEventListener('touchcancel', handleTouchEnd, { passive: true });

        initialized = true;

        // Start animation
        animate();
    }

    /**
     * Create particle instances
     */
    function createParticles() {
        particles = [];
        const count = window.innerWidth < 768 ? CONFIG.particleCountMobile : CONFIG.particleCount;
        
        for (let i = 0; i < count; i++) {
            particles.push(new Particle());
        }
    }

    /**
     * Resize canvas to window size. Scales by devicePixelRatio so particles
     * render crisply on retina/high-DPI displays instead of being up-sampled
     * from a 1x buffer. All subsequent drawing is done in CSS pixels thanks
     * to setTransform(dpr,...).
     */
    function resizeCanvas() {
        const dpr = window.devicePixelRatio || 1;
        const w = window.innerWidth;
        const h = window.innerHeight;
        canvas.width = Math.max(1, Math.floor(w * dpr));
        canvas.height = Math.max(1, Math.floor(h * dpr));
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
        // setTransform replaces any existing transform — required because
        // assigning canvas.width/height resets the 2D context state.
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    /**
     * Handle window resize
     */
    function handleResize() {
        resizeCanvas();
        createParticles();
    }

    /**
     * Handle mouse movement
     */
    function handleMouseMove(e) {
        mouse.x = e.clientX;
        mouse.y = e.clientY;
    }

    /**
     * Handle touch movement
     */
    function handleTouchMove(e) {
        if (e.touches.length > 0) {
            mouse.x = e.touches[0].clientX;
            mouse.y = e.touches[0].clientY;
        }
    }

    /**
     * Handle mouse leave
     */
    function handleMouseLeave() {
        mouse.x = null;
        mouse.y = null;
    }

    /**
     * Handle touch end — only clear mouse when *all* fingers are lifted.
     * Multi-touch otherwise loses interaction until the next touchmove.
     */
    function handleTouchEnd(e) {
        if (!e.touches || e.touches.length === 0) {
            mouse.x = null;
            mouse.y = null;
        }
    }

    /**
     * Animation loop
     */
    function animate() {
        // Clear canvas. We clear the full physical buffer by dividing by
        // the transform (ctx is already scaled by dpr via setTransform).
        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
        
        // Update and draw particles
        for (let i = 0; i < particles.length; i++) {
            particles[i].update();
            particles[i].draw();
        }
        
        // Continue animation
        animationId = requestAnimationFrame(animate);
    }

    /**
     * Debounce helper
     */
    function debounce(func, wait) {
        let timeout;
        function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        }
        executedFunction.cancel = () => clearTimeout(timeout);
        return executedFunction;
    }

    /**
     * Cleanup (for SPA or dynamic loading)
     */
    function destroy() {
        if (animationId) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }
        if (debouncedResize) {
            debouncedResize.cancel();
            window.removeEventListener('resize', debouncedResize);
            debouncedResize = null;
        }
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseleave', handleMouseLeave);
        window.removeEventListener('touchmove', handleTouchMove);
        window.removeEventListener('touchend', handleTouchEnd);
        window.removeEventListener('touchcancel', handleTouchEnd);
        particles = [];
        initialized = false;
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Expose for debugging/control
    window.TriggerForgeParticles = {
        init,
        destroy,
        applyPreset,
        getParticleCount: () => particles.length
    };

})();

