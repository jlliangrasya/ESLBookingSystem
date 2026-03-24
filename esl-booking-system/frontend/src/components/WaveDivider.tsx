interface Props {
  fill?: string;
  className?: string;
}

const WaveDivider = ({ fill = "#ffffff", className = "" }: Props) => (
  <div className={`w-full overflow-hidden leading-[0] -mb-px ${className}`}>
    <svg
      viewBox="0 0 1440 80"
      preserveAspectRatio="none"
      className="w-full h-[40px] sm:h-[56px] md:h-[72px]"
    >
      <path
        d="M0,48 C320,80 640,16 960,48 C1120,64 1280,32 1440,48 L1440,80 L0,80 Z"
        fill={fill}
      />
    </svg>
  </div>
);

export default WaveDivider;
