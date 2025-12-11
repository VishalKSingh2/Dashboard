// Optimize Recharts bundle size by using named imports
// This file helps with tree-shaking unused Recharts components

export {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

// Note: Only import what you need from recharts to reduce bundle size
// Each chart component should import from this file instead of directly from 'recharts'
