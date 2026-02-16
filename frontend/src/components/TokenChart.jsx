import React, { useEffect, useState } from 'react';
import { LineChart, Line, ResponsiveContainer, YAxis, Tooltip } from 'recharts';

const TokenChart = ({ pairAddress }) => {
  const [data, setData] = useState([]);

  useEffect(() => {
    const fetchChartData = async () => {
      try {
        const res = await fetch(
          `https://api.geckoterminal.com/solana/pools/${pairAddress}/ohlcv/day`
        );
        const json = await res.json();
        
        const formattedData = json.data.attributes.ohlcv_list.map(item => ({
          time: new Date(item[0] * 1000).toLocaleDateString(),
          price: item[4] // Closing price
        })).reverse(); // Reverse to show oldest to newest

        setData(formattedData);
      } catch (err) {
        console.error("Error fetching chart data:", err);
      }
    };

    fetchChartData();
  }, [pairAddress]);

  return (
    <div style={{ width: '100%', height: 200, background: '#1a1a1a', padding: '20px', borderRadius: '12px' }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Tooltip 
            contentStyle={{ backgroundColor: '#333', border: 'none', color: '#fff' }}
            itemStyle={{ color: '#8884d8' }}
          />
          <YAxis hide domain={['auto', 'auto']} />
          <Line 
            type="monotone" 
            dataKey="price" 
            stroke="#00ffad" 
            strokeWidth={2} 
            dot={false} 
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default TokenChart;
