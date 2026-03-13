import { Music } from "lucide-react";

export function EmptyState() {
  return (
    <div className="text-center py-16">
      <Music className="mx-auto h-12 w-12 text-black mb-4" />
      <h3 className="text-xl text-black">NO SHOWS TO SEE HERE, YET.</h3>
    </div>
  );
}

export default EmptyState;
