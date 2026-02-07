
import React from 'react';
import { ActionLog } from './api';

export function formatActionLog(log: ActionLog): React.ReactNode {
    // define styles
    const highlight = "text-orange-400 font-bold mx-1";
    const dim = "text-stone-500 mx-1";
    const playerStyle = "text-stone-300 font-bold mx-1 hover:text-white transition-colors cursor-pointer hover:underline";

    // Helper to render gold/exp with icons or colors
    const renderRewards = (data: any) => {
        const rewards = [];
        if (data.exp || data.expGain) {
            rewards.push(
                <span key="exp" className="text-blue-400 ml-1">
                    EXP+{data.exp || data.expGain}
                </span>
            );
        }
        if (data.gold) {
            rewards.push(
                <span key="gold" className="text-yellow-400 ml-1">
                    💰+{data.gold}
                </span>
            );
        }
        if (rewards.length === 0) return null;
        return <span className="text-[10px] opacity-80">({rewards})</span>;
    };

    if (!log.data) {
        return (
            <span>
                {log.details}
            </span>
        );
    }

    const { data } = log;

    switch (log.action) {
        case 'PLANT':
            return (
                <span>
                    Planted <span className={highlight}>{data.cropName}</span>
                    {renderRewards(data)}
                </span>
            );

        case 'HARVEST':
            return (
                <span>
                    Harvested <span className={highlight}>{data.cropName}</span>
                    {data.yield > 1 && <span className={dim}>x{data.yield}</span>}
                    {renderRewards(data)}
                </span>
            );

        case 'STEAL':
            const victim = data.victimName ? <span className={playerStyle}>{data.victimName}</span> : <span className={playerStyle}>someone</span>;
            return (
                <span>
                    Stole <span className={highlight}>{data.cropName}</span>
                    <span className={dim}>from</span>
                    {victim}
                    {renderRewards(data)}
                </span>
            );

        case 'STOLEN':
            const thief = <span className={playerStyle}>{data.thiefName || 'someone'}</span>;
            return (
                <span>
                    Stolen by {thief}
                    <span className={highlight}>({data.cropName} x{data.amount})</span>
                </span>
            );

        case 'CARE':
            const actionMap: Record<string, string> = {
                water: 'Watered',
                weed: 'Removed weeds',
                pest: 'Removed bugs'
            };
            const actionText = actionMap[data.type] || 'Helped';
            const owner = data.ownerName ? <span className={playerStyle}>{data.ownerName}</span> : null;

            return (
                <span>
                    {actionText}
                    {owner && owner !== log.playerName && (
                        <>
                            <span className={dim}>for</span>
                            {owner}
                        </>
                    )}
                    {renderRewards(data)}
                </span>
            );

        case 'HELPED':
            const helper = <span className={playerStyle}>{data.helperName || 'neighbor'}</span>;
            const helpActionMap: Record<string, string> = {
                water: 'Watered',
                weed: 'Weeded',
                pest: 'Pest control'
            };
            return (
                <span>
                    {helpActionMap[data.type] || 'Helped'} by {helper}
                </span>
            );

        case 'SHOVEL':
            const shovelOwner = data.ownerName ? <span className={playerStyle}>{data.ownerName}</span> : null;
            return (
                <span>
                    {data.ownerId === log.playerId ? 'Cleared land' : 'Helped clear land'}
                    {shovelOwner && shovelOwner !== log.playerName && (
                        <>
                            <span className={dim}>for</span>
                            {shovelOwner}
                        </>
                    )}
                    {renderRewards(data)}
                </span>
            );

        case 'CLEARED':
            const cleaner = <span className={playerStyle}>{data.helperName || 'neighbor'}</span>;
            return (
                <span>
                    Land cleared by {cleaner}
                </span>
            );

        case 'LEVEL_UP':
            return (
                <span>
                    <span className="text-yellow-300 font-bold animate-pulse ml-1">
                        LEVEL UP!
                    </span>
                </span>
            );

        case 'DISASTER':
            if (data.type === 'disaster') {
                return <span className="text-red-400">Natural disaster struck!</span>;
            }
            return <span>{log.details}</span>;

        case 'DOG_BITE':
            return (
                <span>
                    <span className="text-red-400 mx-1">
                        was bitten by dog!
                    </span>
                    <span className="text-red-500 font-bold">-{data.penalty} Gold</span>
                </span>
            );

        case 'DOG_CATCH':
            const caughtThief = <span className={playerStyle}>{data.thiefName || 'thief'}</span>;
            return (
                <span>
                    Dog caught {caughtThief}!
                    <span className="text-green-400 font-bold ml-1">Good dog! 🐕</span>
                </span>
            );

        case 'FERTILIZE':
            return (
                <span>
                    Used <span className={highlight}>Fertilizer</span>
                    <span className={dim}>to speed up growth</span>
                </span>
            );

        case 'EXPAND_LAND':
            return (
                <span>
                    Expanded farm to <span className={highlight}>{data.landCount}</span> lands!
                </span>
            );

        case 'UPGRADE_LAND':
            return (
                <span>
                    Upgraded land to <span className={highlight}>{data.landType}</span>
                </span>
            );

        case 'FEED_DOG':
            return (
                <span>
                    Fed the dog 🦴
                </span>
            );

        case 'BUY_DOG':
            return (
                <span>
                    Bought a dog 🐕
                </span>
            );

        default:
            return (
                <span>
                    {log.details}
                </span>
            );
    }
}
