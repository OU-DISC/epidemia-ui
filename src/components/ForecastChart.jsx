import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Area,
  ResponsiveContainer
} from "recharts";

export default function ForecastChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={350}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" />
        <YAxis />
        <Tooltip />

        {/* Uncertainty band */}
        <Area
          type="monotone"
          dataKey="upper"
          stroke="none"
          fillOpacity={0.25}
          fill="#8884d8"
          baseLine={(x) => x.lower}
        />

        {/* Forecast median */}
        <Line
          type="monotone"
          dataKey="median"
          stroke="#d62728"
          strokeWidth={2}
          dot={false}
        />

        {/* Observed */}
        <Line
          type="monotone"
          dataKey="observed"
          stroke="#1f77b4"
          strokeWidth={2}
          dot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
