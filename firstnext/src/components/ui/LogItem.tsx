
import React from 'react';
import { ActionLog } from '../../lib/api';
import { useI18n } from '@/lib/i18n';

interface LogItemProps {
    log: ActionLog;
    onPlayerClick?: (id: string) => void;
}

export function LogItem({ log, onPlayerClick }: LogItemProps) {
    const { t } = useI18n();

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

    // Helper to render clickable player name
    const renderPlayer = (name: string, id?: string) => {
        if (!name) return null;
        if (!id || !onPlayerClick) {
            return <span className={playerStyle}>{name}</span>;
        }
        return (
            <span
                className={playerStyle}
                onClick={(e) => {
                    e.stopPropagation();
                    onPlayerClick(id);
                }}
            >
                {name}
            </span>
        );
    };

    const { data } = log;
    const cropName = data.cropId ? t(`crops.${data.cropId}`) : data?.cropName;

    switch (log.action) {
        case 'PLANT':
            return (
                <span>
                    {t('log.plant')} <span className={highlight}>{cropName}</span>
                    {renderRewards(data)}
                </span>
            );

        case 'HARVEST':
            return (
                <span>
                    {t('log.harvest')} <span className={highlight}>{cropName}</span>
                    {data.yield > 1 && <span className={dim}>x{data.yield}</span>}
                    {renderRewards(data)}
                </span>
            );

        case 'STEAL':
            const victim = renderPlayer(data.victimName || t('log.someone'), data.victimId);
            return (
                <span>
                    {t('log.steal')} <span className={highlight}>{cropName}</span>
                    <span className={dim}>{t('log.from')}</span>
                    {victim}
                    {renderRewards(data)}
                </span>
            );

        case 'STOLEN':
            const thief = renderPlayer(data.thiefName || t('log.someone'), data.thiefId);
            return (
                <span>
                    {t('log.stolenBy')} {thief}
                    <span className={highlight}>({cropName} x{data.amount})</span>
                </span>
            );

        case 'CARE':
            const actionMap: Record<string, string> = {
                water: t('log.water'),
                weed: t('log.weed'),
                pest: t('log.pest')
            };
            const actionText = actionMap[data.type] || t('log.helpDefault');
            const owner = renderPlayer(data.ownerName, data.ownerId);

            return (
                <span>
                    {actionText}
                    {owner && data.ownerName !== log.playerName && (
                        <>
                            <span className={dim}>{t('log.for')}</span>
                            {owner}
                        </>
                    )}
                    {renderRewards(data)}
                </span>
            );

        case 'HELPED':
            const helper = renderPlayer(data.helperName || t('log.neighbor'), data.helperId);
            const helpActionMap: Record<string, string> = {
                water: t('log.water'),
                weed: t('log.weed'),
                pest: t('log.pest')
            };
            return (
                <span>
                    {helpActionMap[data.type] || t('log.helpDefault')} {t('log.by')} {helper}
                </span>
            );

        case 'SHOVEL':
            const shovelOwner = renderPlayer(data.ownerName, data.ownerId);
            return (
                <span>
                    {data.ownerId === log.playerId ? t('log.cleared') : t('log.helpedClear')}
                    {shovelOwner && data.ownerName !== log.playerName && (
                        <>
                            <span className={dim}>{t('log.for')}</span>
                            {shovelOwner}
                        </>
                    )}
                    {renderRewards(data)}
                </span>
            );

        case 'CLEARED':
            const cleaner = renderPlayer(data.helperName || t('log.neighbor'), data.helperId);
            return (
                <span>
                    {t('log.landClearedBy')} {cleaner}
                </span>
            );

        case 'LEVEL_UP':
            return (
                <span>
                    <span className="text-yellow-300 font-bold animate-pulse ml-1">
                        {t('log.levelUp')}
                    </span>
                </span>
            );

        case 'DISASTER':
            if (data.type === 'disaster') {
                return <span className="text-red-400">{t('log.disaster')}</span>;
            }
            return <span>{log.details}</span>;

        case 'DOG_BITE':
            return (
                <span>
                    <span className="text-red-400 mx-1">
                        {t('log.bitten')}
                    </span>
                    <span className="text-red-500 font-bold">-{data.penalty} {t('land.gold')}</span>
                </span>
            );

        case 'DOG_CATCH':
            const caughtThief = renderPlayer(data.thiefName || t('log.thief'), data.thiefId);
            return (
                <span>
                    {t('log.dogCaught')} {caughtThief}!
                    <span className="text-green-400 font-bold ml-1">{t('log.goodDog')}</span>
                    {data.compensation && (
                        <span className="text-yellow-400 font-bold ml-1">
                            +{data.compensation} {t('land.gold')}
                        </span>
                    )}
                </span>
            );

        case 'FERTILIZE':
            return (
                <span>
                    {t('log.fertilize')} <span className={highlight}>{t('log.fertilizer')}</span>
                    <span className={dim}>{t('log.fertilizeReason')}</span>
                </span>
            );

        case 'EXPAND_LAND':
            return (
                <span>
                    {t('log.expand')} <span className={highlight}>{data.landCount}</span> {t('log.lands')}
                </span>
            );

        case 'UPGRADE_LAND':
            return (
                <span>
                    {t('log.upgrade')} <span className={highlight}>{t(`land.${data.landType}`)}</span>
                </span>
            );

        case 'FEED_DOG':
            return (
                <span>
                    {t('log.feedDog')}
                </span>
            );

        case 'BUY_DOG':
            return (
                <span>
                    {t('log.buyDog')}
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
