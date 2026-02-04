import { FarmDashboard } from "@/components/FarmDashboard";

interface Props {
  params: Promise<{ username: string }>;
}

export default async function UserPage({ params }: Props) {
  // 解码 URL 参数（例如处理空格或特殊字符）
  const { username } = await params;
  const decodedUsername = decodeURIComponent(username);

  // 渲染仪表盘并传入初始用户名，触发自动加载
  return <FarmDashboard initialUsername={decodedUsername} />;
}

