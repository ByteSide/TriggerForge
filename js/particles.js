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

    // State
    let canvas, ctx;
    let particles = [];
    let mouse = { x: null, y: null };
    let animationId;
    let isReducedMotion = false;

    /**
     * Particle Class
     */
    class Particle {
        constructor() {
            this.reset();
        }

        reset() {
            this.x = Math.random() * canvas.width;
            this.y = Math.random() * canvas.height;
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

            // Wrap around edges
            if (this.baseX < -10) this.baseX = canvas.width + 10;
            if (this.baseX > canvas.width + 10) this.baseX = -10;
            if (this.baseY < -10) this.baseY = canvas.height + 10;
            if (this.baseY > canvas.height + 10) this.baseY = -10;

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
        // Check for reduced motion preference
        isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (isReducedMotion) return;

        canvas = document.getElementById('particle-canvas');
        if (!canvas) return;

        ctx = canvas.getContext('2d');
        
        // Set canvas size
        resizeCanvas();
        
        // Create particles
        createParticles();
        
        // Event listeners
        window.addEventListener('resize', debounce(handleResize, 250));
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseleave', handleMouseLeave);
        window.addEventListener('touchmove', handleTouchMove, { passive: true });
        window.addEventListener('touchend', handleMouseLeave);
        
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
     * Resize canvas to window size
     */
    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
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
     * Handle mouse/touch leave
     */
    function handleMouseLeave() {
        mouse.x = null;
        mouse.y = null;
    }

    /**
     * Animation loop
     */
    function animate() {
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
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
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    /**
     * Cleanup (for SPA or dynamic loading)
     */
    function destroy() {
        if (animationId) {
            cancelAnimationFrame(animationId);
        }
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseleave', handleMouseLeave);
        window.removeEventListener('touchmove', handleTouchMove);
        window.removeEventListener('touchend', handleMouseLeave);
        particles = [];
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
        getParticleCount: () => particles.length
    };

})();

