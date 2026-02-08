import { FarmDashboard } from "@/components/FarmDashboard";

interface Props {
    params: Promise<{ id: string }>;
}

export default async function UserPage({ params }: Props) {
    const { id } = await params;

    // [修改] 移除 key，完全依赖内部的 useParams 监听变化
    return <FarmDashboard initialUserId={id} />;
}