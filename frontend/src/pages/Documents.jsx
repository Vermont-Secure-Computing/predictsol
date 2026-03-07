import { useState } from "react";

export default function Documents() {
    return (
        <div className="min-h-screen bg-gray-50 dark:bg-black/90 p-6">
            <div className="max-w-4xl mx-auto space-y-4">

            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
                PredictSol's White Paper
            </h1>

            <div className="w-full h-[80vh] border rounded-lg overflow-hidden">
                <iframe
                    src="/docs/predictsol_whitepaper.pdf"
                    title="PredictSol FAQ"
                    className="w-full h-full"
                />
            </div>

            </div>
        </div>
    );
}
