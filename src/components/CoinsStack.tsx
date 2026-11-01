export default function CoinsStack() {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-center gap-1 pb-2">
      <div className="flex flex-col items-center">
        <div className="coin h-10 w-10" />
        <div className="coin -mt-3 h-12 w-12" />
      </div>
      <div className="flex flex-col items-center">
        <div className="coin h-8 w-8" />
        <div className="coin -mt-2 h-11 w-11" />
        <div className="coin -mt-3 h-14 w-14" />
      </div>
      <div className="flex flex-col items-center">
        <div className="coin h-9 w-9" />
        <div className="coin -mt-3 h-12 w-12" />
      </div>
    </div>
  );
}
