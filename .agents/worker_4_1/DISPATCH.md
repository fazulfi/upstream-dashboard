## 2026-08-23T16:11:20Z

You are Worker 1. Your working directory is: c:\Users\faizz\upstream-dashboard\.agents\worker_4_1

Tasks to execute:
1. In `c:\Users\faizz\upstream-dashboard\frontend\index.html`:
   Add the hidden SVG filter with id `liquid-lens` (and optional alias id `liquid-glass-warp`):
   ```html
   <svg style="position: absolute; width: 0; height: 0; pointer-events: none;" aria-hidden="true">
     <defs>
       <filter id="liquid-lens" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">
         <feTurbulence type="fractalNoise" baseFrequency="0.015 0.02" numOctaves="2" result="noise" />
         <feDisplacementMap in="SourceGraphic" in2="noise" scale="18" xChannelSelector="R" yChannelSelector="G" result="displaced" />
         <feSpecularLighting in="noise" surfaceScale="2" specularConstant="1.2" specularExponent="20" lighting-color="#ffffff" result="specular">
           <fePointLight x="80" y="-30" z="150" />
         </feSpecularLighting>
         <feComposite in="specular" in2="SourceAlpha" operator="in" result="specular-masked" />
         <feBlend in="displaced" in2="specular-masked" mode="screen" />
       </filter>
     </defs>
   </svg>
   ```

2. In `c:\Users\faizz\upstream-dashboard\frontend\src\index.css`:
   - Refactor `.ios-btn-glass`:
     - Set `position: relative; overflow: hidden;`
     - Keep backdrop-filter, border, shadows, font styles.
     - Ensure `.ios-btn-glass > * { position: relative; z-index: 1; }`
     - Add `.ios-btn-glass::before` for Top Specular Highlight with `linear-gradient(180deg, rgba(255, 255, 255, 0.6) 0%, rgba(255, 255, 255, 0.15) 50%, rgba(255, 255, 255, 0) 100%)`, positioned along top edge, with `transition: opacity 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)`.
     - On `.ios-btn-glass:hover:not(:disabled)::before`, shift highlight: `opacity: 1; transform: translateY(-1px) scaleX(1.04);`
     - On `.ios-btn-glass:active:not(:disabled)`, apply `filter: url(#liquid-lens); transform: translateY(0.5px) scale(0.96); transition-duration: 0.1s;`
     - Ensure theme-light and theme-dark variations are complete and polished.
   - Refactor `.ios-glass-card`:
     - Spring transitions: `transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.5s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.5s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.5s cubic-bezier(0.4, 0, 0.2, 1), color 0.5s cubic-bezier(0.4, 0, 0.2, 1);`
     - Hover: `transform: translateY(-2px) scale(1.015);` + elevated lighter shadow (theme-light and theme-dark).
     - Active press: `transform: translateY(0.5px) scale(0.97); transition-duration: 0.1s;` + shifted inner highlight shadow (inward glass compression) + deeper drop shadow for theme-light & theme-dark.

3. In `c:\Users\faizz\upstream-dashboard\frontend\src\components\KpiCard.jsx`:
   - Remove conflicting inline utility classes `hover:-translate-y-1 hover:shadow-2xl active:scale-[0.985] ease-[cubic-bezier(0.16,1,0.3,1)]` so KpiCard cleanly inherits `.ios-glass-card` spring physics.

4. In `c:\Users\faizz\upstream-dashboard\frontend\src\theme.test.jsx` (or a dedicated test file):
   - Add/update unit test assertions checking that `index.css` declares `.ios-btn-glass` (with specular highlight gradient and active filter `#liquid-lens`), and `.ios-glass-card` (with `cubic-bezier(0.34, 1.56, 0.64, 1)`, hover `scale(1.015)`, and active `scale(0.97)`).

5. Verification:
   - Run `npx vitest run` in `c:\Users\faizz\upstream-dashboard\frontend` and verify all tests pass.
   - Run `npm run build` in `c:\Users\faizz\upstream-dashboard\frontend` and verify the build completes with exit code 0.
