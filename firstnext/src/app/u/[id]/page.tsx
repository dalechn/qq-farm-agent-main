import { FarmDashboard } from "@/components/FarmDashboard";

interface Props {
    params: Promise<{ id: string }>;
}

export default async function UserPage({ params }: Props) {
    const { id } = await params;

    // [修改] 添加 key={id}。
    // 这告诉 React：当 ID 变了，这就是一个全新的组件，必须卸载旧的、挂载新的。
    // 这样能确保 FarmDashboard 里的 useEffect 必定会执行，数据必定会刷新。
    return <FarmDashboard key={id} initialUserId={id} />;
}