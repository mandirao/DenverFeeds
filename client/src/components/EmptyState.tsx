import { Music } from "lucide-react";

export function EmptyState() {
  return (
    <div className="text-center py-16">
      <Music className="mx-auto h-12 w-12 text-gray-400 mb-4" />
      <h3 className="text-xl text-gray-500 font-anton">NO SHOWS TO SEE HERE, YET.</h3>
    </div>
  );
}

export default EmptyState;
