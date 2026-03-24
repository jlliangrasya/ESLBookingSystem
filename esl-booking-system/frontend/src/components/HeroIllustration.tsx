const HeroIllustration = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 440 360" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
    {/* Background soft circle */}
    <circle cx="220" cy="180" r="160" fill="#EEF6FA" />
    <circle cx="220" cy="180" r="120" fill="#D0E8F0" opacity="0.3" />

    {/* Desk */}
    <rect x="80" y="252" width="280" height="10" rx="5" fill="#2E6B9E" opacity="0.12" />
    <rect x="115" y="262" width="6" height="50" rx="3" fill="#2E6B9E" opacity="0.08" />
    <rect x="319" y="262" width="6" height="50" rx="3" fill="#2E6B9E" opacity="0.08" />

    {/* Laptop */}
    <rect x="155" y="208" width="130" height="44" rx="5" fill="#2E6B9E" />
    <rect x="160" y="213" width="120" height="34" rx="3" fill="#4A9EAF" />
    <rect x="169" y="221" width="55" height="3.5" rx="1.75" fill="white" opacity="0.6" />
    <rect x="169" y="228" width="38" height="3.5" rx="1.75" fill="white" opacity="0.4" />
    <rect x="169" y="235" width="46" height="3.5" rx="1.75" fill="white" opacity="0.3" />
    <path d="M145 252 L155 244 L285 244 L295 252 Z" fill="#245A85" />

    {/* Books (left of laptop) — colorful stack */}
    <rect x="90" y="232" width="48" height="8" rx="2" fill="#F4A261" />
    <rect x="93" y="224" width="42" height="8" rx="2" fill="#E76F7A" opacity="0.85" />
    <rect x="95" y="216" width="38" height="8" rx="2" fill="#7EC8A0" opacity="0.85" />

    {/* Pen holder (right of laptop) — with colorful pens */}
    <rect x="310" y="230" width="22" height="22" rx="4" fill="#F4A261" opacity="0.25" />
    <line x1="316" y1="230" x2="316" y2="218" stroke="#E76F7A" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
    <line x1="321" y1="230" x2="321" y2="215" stroke="#6BBAD0" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
    <line x1="326" y1="230" x2="326" y2="220" stroke="#7EC8A0" strokeWidth="2" strokeLinecap="round" opacity="0.6" />

    {/* ── Teacher figure (center-left) — blue top ── */}
    <circle cx="185" cy="148" r="22" fill="#F5DEB3" />
    <path d="M163 141 Q163 123 185 123 Q207 123 207 141 Q203 132 185 132 Q167 132 163 141 Z" fill="#4A3728" />
    <path d="M167 170 Q167 163 176 163 L194 163 Q203 163 203 170 L207 208 L163 208 Z" fill="#2E6B9E" />
    <path d="M176 163 L185 170 L194 163" stroke="white" strokeWidth="1.5" fill="none" />
    <path d="M167 178 L150 196 L154 200" stroke="#2E6B9E" strokeWidth="7" strokeLinecap="round" fill="none" />
    <path d="M203 178 L220 196 L216 200" stroke="#2E6B9E" strokeWidth="7" strokeLinecap="round" fill="none" />

    {/* ── Student 1 (right) — coral/salmon top ── */}
    <circle cx="295" cy="156" r="18" fill="#F5DEB3" />
    <path d="M277 150 Q277 136 295 136 Q313 136 313 150" fill="#2C1810" />
    <path d="M277 150 Q277 145 282 147 L277 154" fill="#2C1810" />
    <path d="M313 150 Q313 145 308 147 L313 154" fill="#2C1810" />
    <path d="M281 174 Q281 168 287 168 L303 168 Q309 168 309 174 L312 208 L278 208 Z" fill="#E76F7A" />

    {/* ── Student 2 (behind, smaller) — warm yellow top ── */}
    <circle cx="340" cy="164" r="15" fill="#F5DEB3" />
    <path d="M325 159 Q325 148 340 148 Q355 148 355 159 Q351 153 340 153 Q329 153 325 159 Z" fill="#5C3317" />
    <path d="M329 179 Q329 174 333 174 L347 174 Q351 174 351 179 L353 208 L327 208 Z" fill="#F4A261" />

    {/* Speech bubble from teacher */}
    <rect x="210" y="108" width="64" height="28" rx="10" fill="white" stroke="#D0E8F0" strokeWidth="1.5" />
    <path d="M224 136 L220 143 L232 136" fill="white" stroke="#D0E8F0" strokeWidth="1.5" />
    <text x="222" y="126" fill="#2E6B9E" fontSize="11" fontWeight="600" fontFamily="sans-serif">Hello!</text>

    {/* Speech bubble from student */}
    <rect x="298" y="120" width="46" height="24" rx="8" fill="white" stroke="#D0E8F0" strokeWidth="1.5" />
    <path d="M310 144 L307 150 L316 144" fill="white" stroke="#D0E8F0" strokeWidth="1.5" />
    <text x="305" y="136" fill="#E76F7A" fontSize="10" fontWeight="600" fontFamily="sans-serif">Hi!</text>

    {/* Floating decorative — ABC badge (warm yellow bg) */}
    <g transform="translate(82, 115)">
      <circle r="16" fill="#FEF3C7" stroke="#F4A261" strokeWidth="1" />
      <text y="4.5" textAnchor="middle" fill="#D4900A" fontSize="10" fontWeight="700" fontFamily="sans-serif">ABC</text>
    </g>

    {/* Floating decorative — star (pastel coral) */}
    <g transform="translate(400, 130)">
      <circle r="12" fill="#FDDEDE" stroke="#E76F7A" strokeWidth="1" />
      <text y="4" textAnchor="middle" fill="#E76F7A" fontSize="11">★</text>
    </g>

    {/* Floating decorative — globe */}
    <g transform="translate(370, 190)">
      <circle r="13" fill="#F0F9F7" stroke="#4A9EAF" strokeWidth="1.2" />
      <ellipse rx="7" ry="13" fill="none" stroke="#4A9EAF" strokeWidth="0.8" />
      <line x1="-13" y1="0" x2="13" y2="0" stroke="#4A9EAF" strokeWidth="0.8" />
    </g>

    {/* Small colorful accent dots */}
    <circle cx="60" cy="160" r="3" fill="#E76F7A" opacity="0.25" />
    <circle cx="55" cy="200" r="2" fill="#F4A261" opacity="0.2" />
    <circle cx="395" cy="160" r="2" fill="#7EC8A0" opacity="0.25" />
    <circle cx="75" cy="240" r="2.5" fill="#6BBAD0" opacity="0.2" />
  </svg>
);

export default HeroIllustration;
