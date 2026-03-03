import { useState } from "react";

function FAQItem({ question, children }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left p-4 flex justify-between items-center
                   bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
      >
        <span className="font-semibold text-gray-900 dark:text-white">
          {question}
        </span>

        <span className="text-gray-500 dark:text-gray-400">
          {open ? "−" : "+"}
        </span>
      </button>

      {open && (
        <div className="p-4 text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900/60">
          {children}
        </div>
      )}
    </div>
  );
}

export default function FAQ() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-black/90 p-6">
      <div className="max-w-4xl mx-auto space-y-4">

        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
          PredictSol FAQ
        </h1>

        {/* Mintable Question */}
        <FAQItem question="Why does the token say 'This token is mintable'?">
          <p>
            Wallets show “mintable” because the token mint has a Mint Authority.
            In PredictSol, the mint authority is a <strong>Program Derived Address (PDA)</strong>.
          </p>

          <p className="mt-3">
            This does <strong>NOT</strong> mean the team can mint tokens freely.
            Minting only happens when a user deposits SOL into the contract.
          </p>
        </FAQItem>

        <FAQItem question="Can the team mint tokens anytime?">
          <p>
            No. Minting is only possible inside the smart contract function:
          </p>

          <div className="bg-gray-200 dark:bg-gray-800 p-2 rounded mt-2 text-xs font-mono">
            buy_positions_with_fee()
          </div>

          <p className="mt-3">
            This function requires a SOL deposit before any tokens are minted.
          </p>
        </FAQItem>

        <FAQItem question="What is the Mint Authority?">
          <p>
            The Mint Authority is a PDA controlled by the smart contract.
          </p>

          <p className="mt-2">
            It has:
          </p>

          <ul className="list-disc list-inside mt-2 space-y-1">
            <li>No private key</li>
            <li>No human control</li>
            <li>No manual signing ability</li>
          </ul>

          <p className="mt-3">
            It only works when the contract executes valid instructions.
          </p>
        </FAQItem>

        <FAQItem question="Are tokens fully collateralized?">
          <p>
            Yes. Every minted TRUE and FALSE token is backed by deposited SOL
            stored in the event's collateral vault.
          </p>
        </FAQItem>

        <FAQItem question="When can tokens be minted?">
          <p>Tokens are minted only when:</p>

          <ul className="list-disc list-inside mt-2 space-y-1">
            <li>A user deposits SOL</li>
            <li>The betting period is active</li>
            <li>The event is not resolved</li>
            <li>All contract checks pass</li>
          </ul>
        </FAQItem>

        <FAQItem question="Can tokens be minted after event resolution?">
          <p>
            No. Once an event is resolved, minting is permanently disabled.
          </p>
        </FAQItem>

        <FAQItem question="How does redemption work?">
          <p>
            Users burn their tokens to redeem SOL from the collateral vault.
          </p>

          <p className="mt-2">
            If there is a winner, only winning tokens redeem full value.
            If tie or below consensus threshold, each side redeems partial value.
          </p>
        </FAQItem>

        <FAQItem question="Is this inflationary?">
          <p>
            No. Supply increases only when collateral increases.
            When tokens are redeemed, they are burned and supply decreases.
          </p>
        </FAQItem>

        <FAQItem question="What happens to unclaimed funds?">
          <p>
            After the sweep delay period (e.g. 30 days),
            unclaimed funds may be transferred to the house treasury.
          </p>
        </FAQItem>

        <FAQItem question="Ways to earn with PredictSol">
          <ul className="mt-4 space-y-4 text-gray-700 leading-relaxed">
            <li className="flex flex-col">
              <span className="font-semibold text-slate-900">1. Arbitrage Low Prices</span>
              <p className="ml-0 text-sm md:text-base">
                If you can buy TRUE and FALSE together for a total price of less that 1 Sol, then you can redeem them on the PredictSol contract for 1 sol, keeping the difference.
              </p>
            </li>

            <li className="flex flex-col">
              <span className="font-semibold text-slate-900">2. Arbitrage High Prices</span>
              <p className="ml-0 text-sm md:text-base">
                If you can sell TRUE and FALSE together for more than 1 Sol, then you can add liquidity on the PredictSol contract at 1 sol for the pair, sell them, and keep the difference.
              </p>
            </li>

            <li className="flex flex-col">
              <span className="font-semibold text-slate-900">3. Predict an event correctly</span>
              <p className="ml-0 text-sm md:text-base">
                Redeem your tokens for full face value in solana.
              </p>
            </li>

            <li className="flex flex-col">
              <span className="font-semibold text-slate-900">4. Liquidity Provision</span>
              <p className="ml-0 text-sm md:text-base">
                Mint TRUE and FALSE by staking solana and then deposit those tokens in a Dex pool to earn money on trading fees. 
              </p>
            </li>

            <li className="flex flex-col">
              <span className="font-semibold text-slate-900">5. Create an event on PredictSol</span>
              <p className="ml-0 text-sm md:text-base">
                Earn one third of a percent of all liquidity added to that event.
              </p>
            </li>
          </ul>
        </FAQItem>

      </div>
    </div>
  );
}
