/** Same mark as public/favicon.svg, inlined so the header needs no extra request. */
export default function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <rect width="40" height="40" rx="8" fill="#2f6fd6" />
      <rect x="9" y="9" width="6" height="22" fill="#fff" />
      <rect x="9" y="9" width="18" height="6" fill="#fff" />
      <rect x="9" y="18" width="13" height="6" fill="#fff" />
      <rect x="24" y="27" width="4" height="6" fill="#3ecf6e" />
      <rect x="29" y="22" width="4" height="11" fill="#3ecf6e" />
      <rect x="34" y="17" width="4" height="16" fill="#3ecf6e" />
    </svg>
  )
}
