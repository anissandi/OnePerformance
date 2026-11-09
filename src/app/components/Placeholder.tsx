import { Construction } from "lucide-react";

export function Placeholder() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-gray-500 pb-20">
      <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
        <Construction className="w-8 h-8 text-gray-400" />
      </div>
      <h2 className="text-xl font-semibold text-gray-900 mb-2">Coming Soon</h2>
      <p className="text-sm max-w-md text-center">This section of the prototype is currently under development.</p>
    </div>
  );
}
