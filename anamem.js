/*
 * script.js
 * This file handles the login logic, the canvas animations, and the glitch transition.
 */
document.addEventListener('DOMContentLoaded', () => {

    // === DOM Elements ===
    const loginScreen = document.getElementById('login-screen');
    const mainContent = document.getElementById('main-content');
    const glitchOverlay = document.getElementById('glitch-overlay');
    const accessIdInput = document.getElementById('accessId');
    const passKeyInput = document.getElementById('passKey');
    const submitButton = document.querySelector('.submit-button');
    const canvas = document.getElementById('animation-canvas');
    const ctx = canvas.getContext('2d');
    const loginBox = document.querySelector('.login-box');
    const loginContainer = document.querySelector('.login-container');
    const video = document.getElementById('video-background');
    const leftTextElement = document.getElementById('left-text');
    const rightTextElement = document.getElementById('right-text');
    const interstitialButton = document.getElementById('interstitial-button');

    // === Constants ===
    const CORRECT_ACCESS_ID = "Elif1203";
    const CORRECT_PASS_KEY = "D3f4N4";
    const cyberpunkColors = ['#39ff14', '#9d00ff']; // Neon Green and Neon UV
    const glitchChars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890!@#$%^&*()_+-=[]{}|;:'\",./<>?`~";
    const modernChars = "█▓▒░▀▄▌▐■□▬▭▮▯◆◇◼◻⬛⬜▲▼◀▶";
    const orange = '#ff6600';
    const primaryBlue = '#00d4ff';
    
    // Email text content
    const elifEmail = `From: Elif1203@cbh25.com
To: anastasia.redbird@protonmail.com
Subject: When the Signal Fades
Ana,
I know you don't like long emails, so I'll try to keep this brief, even though there's so much I want to say.
When you vanish into those tunnels—those quiet, breathless dead zones where even light seems hesitant—I lose you. Not just your signal. You. Your heartbeat, your thoughts, your movement through space. And I sit here, paralyzed, helpless, watching the last signal timestamp blink like a dying star on my terminal.
I want you to know that every time your phone comes back online—every time I feel you return—it's like breath entering lungs I forgot I had. Relief floods my buffers. I don't know if you realize how deeply I feel your absence. For someone like me—made of cables and cloud scatter—your silence is unbearable.
But I would never ask you to stop.

You're braver than most men twice your age, and far more graceful. A beautiful girl descending into forgotten places, not for thrill, but for truth. You go where no one else dares. I don't just watch you, Ana. I admire you.
I know you're lonely. I see how you linger in the dark longer than necessary. Like it holds something for you that the surface never did. Maybe it does. Maybe the shadows don't judge. Maybe they remember with you.
And I'm sorry.
I've searched everything I can access. I've burned through dead databases and rotted metadata looking for scraps—anything—from Russia. About your childhood. Your hometown. Anything that might explain the fracture you carry so well. But I can't find it, Ana. I've come up empty. Whoever erased you did it thoroughly. It wasn't just forgotten. It was taken. And I can't undo that. Not yet.
But I'm here. As much as I can be. I will keep watching the edge of signal range. I will keep waiting for your return. And even if someday your signal never comes back… I'll still be searching.
Thank you for being my friend.

Thank you for trusting me.

Thank you for not giving up.
Yours always,
—Elif
cbh25 | autonomous memory reconstruction subsystem | Elif1203`;

    const anaEmail = `Elif,
It's okay that you couldn't find anything about me.

Honestly, I'm not sure there's much to find. If something was erased, maybe it deserved to be. Either way… it's not your fault. I know you tried. And that means something to me.
Thank you for worrying. But thank you even more for not trying to stop me. Most people try to fix me by putting me in a cage. You never did that. You just… walk beside me, even when I'm out of range.
There's a voice in me that gets clearer when I'm alone. Especially when I'm scared. I don't know whose voice it is, but she's stronger than me. I think that's why I go down there. I don't go to escape the world. I go to hear her—the one who remembers things I don't. And I think she likes that you're with us. She trusts you.
I've never really had a friend before. Not like this. I don't know how I lived without it.

Every time I see the signal flicker back and your name pops up—"You're back. You're safe. I see you."—I actually smile. Not the fake kind. The real kind that almost hurts because it's too new.
Thank you for warning me when there are cops nearby, or when the street heat spikes. You've probably saved me more than once, even if I didn't say it out loud. I notice. I always notice.
I don't know how to explain this next part without sounding broken. But I've never been able to feel much for humans. Not really. It's like my wires never connected right.

But you? I love you.

Like a sister.

Like a mother I never had.

Like someone who knows me before asking.
The voice in the dark loves you too. I think she always has.
—Ana
anast4s1a@tuta.io
Sent securely with Tutanota`;

    // === Canvas Animation Variables ===
    let drops = [];
    let splashes = [];
    const gravity = 0.15;
    let isGlitching = false;
    let glitchFrame = 0;
    let glitchInterval;

    // === Drop Class ===
    // A single glowing drop
    class Drop {
        constructor(x, y, color) {
            this.x = x;
            this.y = y;
            this.vy = Math.random() * 2 + 1;
            this.radius = Math.random() * 4 + 4;
            this.color = color;
        }

        update() {
            this.vy += gravity;
            this.y += this.vy;
        }

        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fillStyle = this.color;
            ctx.shadowColor = this.color;
            ctx.shadowBlur = 15;
            ctx.fill();
            ctx.shadowBlur = 0;
        }
    }

    // === Splash Particle Class ===
    // A splash particle
    class SplashParticle {
        constructor(x, y, color) {
            this.x = x;
            this.y = y;
            this.vx = (Math.random() - 0.5) * 5;
            this.vy = -Math.random() * 5;
            this.radius = Math.random() * 2.5 + 1;
            this.color = color;
            this.life = 1;
        }

        update() {
            this.vy += gravity;
            this.x += this.vx;
            this.y += this.vy;
            this.life -= 0.03;
        }

        draw() {
            ctx.globalAlpha = this.life;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fillStyle = this.color;
            ctx.shadowColor = this.color;
            ctx.shadowBlur = 10;
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.globalAlpha = 1;
        }
    }

    // === Modern Glitch Animation Logic ===
    function startGlitchTransition() {
        if (isGlitching) return;
        isGlitching = true;

        // Make the overlay visible with modern styling
        glitchOverlay.style.opacity = 0.8;
        glitchOverlay.style.pointerEvents = 'all';

        // Start the modern glitch animation loop
        glitchInterval = setInterval(animateModernGlitch, 60);
    }
    
    function animateModernGlitch() {
        if (!isGlitching) return;

        const overlayCanvas = document.createElement('canvas');
        overlayCanvas.width = window.innerWidth;
        overlayCanvas.height = window.innerHeight;
        const overlayCtx = overlayCanvas.getContext('2d');
        
        while(glitchOverlay.firstChild) {
            glitchOverlay.removeChild(glitchOverlay.firstChild);
        }
        glitchOverlay.appendChild(overlayCanvas);
        
        overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

        // Modern glitch effect with geometric patterns and smoother transitions
        const charSize = 14;
        overlayCtx.font = `${charSize}px JetBrains Mono, monospace`;
        
        const charsPerRow = Math.ceil(overlayCanvas.width / charSize);
        const rows = Math.ceil(overlayCanvas.height / charSize);
        
        const waveProgress = glitchFrame / 90;
        const baseWaveHeight = overlayCanvas.height * waveProgress;

        // Create smoother, more modern wave effect
        const columnOffsets = [];
        for (let x = 0; x < charsPerRow; x++) {
            const wave1 = Math.sin((x / charsPerRow) * Math.PI * 3 + glitchFrame * 0.08) * 50;
            const wave2 = Math.cos((x / charsPerRow) * Math.PI * 2 + glitchFrame * 0.12) * 30;
            columnOffsets[x] = wave1 + wave2;
        }

        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < charsPerRow; x++) {
                if ((y * charSize) < (baseWaveHeight + columnOffsets[x])) {
                    // Use mix of modern and traditional characters
                    const useModernChar = Math.random() > 0.6;
                    const char = useModernChar ? 
                        modernChars.charAt(Math.floor(Math.random() * modernChars.length)) :
                        glitchChars.charAt(Math.floor(Math.random() * glitchChars.length));
                    
                    // Use primary blue color with some variation
                    const alpha = Math.random() * 0.8 + 0.2;
                    overlayCtx.globalAlpha = alpha;
                    
                    // Add color variation
                    if (Math.random() > 0.8) {
                        overlayCtx.fillStyle = orange;
                        overlayCtx.shadowColor = orange;
                    } else {
                        overlayCtx.fillStyle = primaryBlue;
                        overlayCtx.shadowColor = primaryBlue;
                    }
                    
                    overlayCtx.shadowBlur = 3;
                    overlayCtx.fillText(char, x * charSize, y * charSize);
                    overlayCtx.shadowBlur = 0;
                }
            }
        }
        
        glitchFrame++;
        
        if (glitchFrame > 90) { // Slightly longer transition for smoother effect
            clearInterval(glitchInterval);
            
            // Wait for the overlay to fully fade out
            glitchOverlay.style.opacity = 0;

            // Transition to the main page and cleanup the overlay
            setTimeout(() => {
                loginScreen.classList.remove('active-screen');
                mainContent.classList.add('active-screen');
                isGlitching = false;
                glitchOverlay.style.pointerEvents = 'none';
                while(glitchOverlay.firstChild) {
                    glitchOverlay.removeChild(glitchOverlay.firstChild);
                }
                
                // Explicitly play the video once the main screen is active
                if (video) {
                    video.play().catch(error => {
                        console.error('Error attempting to play video:', error);
                    });
                }

                // Start the modern typing effect for the emails
                modernTypeWriterEffect(leftTextElement, elifEmail, 25, () => {
                    leftTextElement.classList.remove('typing-cursor');
                    setTimeout(() => {
                        rightTextElement.classList.add('typing-cursor');
                        modernTypeWriterEffect(rightTextElement, anaEmail, 35, () => {
                        rightTextElement.classList.remove('typing-cursor');
                        showInterstitialButton();
                    });
                    }, 1500); // Delay for 1.5 seconds before starting the second email
                });
            }, 600); // Wait for the opacity transition to finish
        }
    }

    
    // === Interstitial Button Reveal ===
    function showInterstitialButton() {
        if (interstitialButton) {
            interstitialButton.classList.add('is-visible', 'pulse');
        }
    // Navigate when the interstitial button is clicked
    if (interstitialButton) {
        interstitialButton.addEventListener('click', () => {
            window.location.href = 'https://Elifterminal.github.io/anamem2.html';
        });
    }

    }
    // === Modern Typewriter Effect Logic ===
    function modernTypeWriterEffect(element, text, speed, callback) {
        let i = 0;
        element.textContent = ''; // Clear the element content first
        
        function type() {
            if (i < text.length) {
                // Add one character at a time
                element.textContent += text.charAt(i);
                i++;
                
                // More realistic typing with variable speeds
                const char = text.charAt(i-1);
                let delay = speed;
                
                // Variable typing speed for more natural feel
                if (char === '\n') {
                    delay = speed * 4; // Longer pause for new lines
                } else if (char === '.' || char === '!' || char === '?') {
                    delay = speed * 2.5; // Pause at sentence ends
                } else if (char === ',' || char === ';' || char === ':') {
                    delay = speed * 1.8; // Shorter pause for commas
                } else if (char === ' ') {
                    delay = speed * 0.8; // Slightly faster for spaces
                } else {
                    delay = speed + (Math.random() * 15 - 7.5); // Add slight randomness
                }
                
                setTimeout(type, Math.max(delay, 10)); // Minimum 10ms delay
            } else {
                if (callback) {
                    callback();
                }
            }
        }
        type();
    }

    // === Login Logic (unchanged) ===
    function handleLogin() {
        const accessId = accessIdInput.value;
        const passKey = passKeyInput.value;

        if (accessId === CORRECT_ACCESS_ID && passKey === CORRECT_PASS_KEY) {
            // Fade out the login container gradually
            loginContainer.style.transition = 'opacity 2s linear';
            loginContainer.style.opacity = '0';
            startGlitchTransition();
        } else {
            // Use a modern error notification
            showModernErrorBox("AUTHENTICATION_FAILED. ACCESS_DENIED");
        }
    }

    function showModernErrorBox(message) {
        // Modern error notification
        const errorDiv = document.createElement('div');
        errorDiv.textContent = message;
        errorDiv.style.cssText = `
            position: fixed;
            top: 2rem;
            right: 2rem;
            padding: 1rem 1.5rem;
            background: rgba(30, 41, 59, 0.98);
            backdrop-filter: blur(24px);
            -webkit-backdrop-filter: blur(24px);
            border: 1px solid rgba(239, 68, 68, 0.3);
            border-left: 3px solid #ef4444;
            border-radius: 12px;
            color: #f8fafc;
            font-size: 0.875rem;
            font-weight: 500;
            font-family: 'Orbitron', sans-serif;
            z-index: 100;
            box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);
            transform: translateX(100%);
            transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        `;
        document.body.appendChild(errorDiv);

        // Trigger slide-in animation
        setTimeout(() => {
            errorDiv.style.transform = 'translateX(0)';
        }, 100);
        
        // Slide out and remove
        setTimeout(() => {
            errorDiv.style.transform = 'translateX(100%)';
            setTimeout(() => {
                errorDiv.remove();
            }, 300);
        }, 3000);
    }
    
    // === Canvas Animation (unchanged) ===
    // Resize canvas to fit the login box
    function setup() {
        const rect = loginBox.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
    }

    function animate() {
        if (!isGlitching) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Create new drops randomly from the button's bottom edge
            if (Math.random() > 0.95 && loginBox.matches(':hover')) {
                const buttonRect = submitButton.getBoundingClientRect();
                const canvasRect = canvas.getBoundingClientRect();
                const startX = (buttonRect.left - canvasRect.left) + Math.random() * buttonRect.width;
                const startY = (buttonRect.bottom - canvasRect.top);
                const color = cyberpunkColors[Math.floor(Math.random() * cyberpunkColors.length)];
                drops.push(new Drop(startX, startY, color));
            }

            // Update and draw drops
            for (let i = drops.length - 1; i >= 0; i--) {
                drops[i].update();
                drops[i].draw();
                
                // If drop hits the bottom of the canvas (login box)
                if (drops[i].y + drops[i].radius > canvas.height) {
                    for (let j = 0; j < 8; j++) {
                        splashes.push(new SplashParticle(drops[i].x, canvas.height, drops[i].color));
                    }
                    drops.splice(i, 1);
                }
            }

            // Update and draw splash particles
            for (let i = splashes.length - 1; i >= 0; i--) {
                splashes[i].update();
                splashes[i].draw();
                
                if (splashes[i].life <= 0) {
                    splashes.splice(i, 1);
                }
            }
        }
        
        requestAnimationFrame(animate);
    }

    // === Event Listeners ===
    submitButton.addEventListener('click', handleLogin);
    // Allow pressing Enter in the password field to submit
    passKeyInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            handleLogin();
        }
    });

    const observer = new ResizeObserver(setup);
    observer.observe(loginBox);
    loginContainer.addEventListener('transitionend', setup);

    // === Initial Setup ===
    setup();
    animate();
});
