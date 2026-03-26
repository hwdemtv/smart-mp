/**
 * LineMapper 单元测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { LineMapper } from '../../utils/line-mapper';

// 本地定义测试用的映射条目类型
interface MappingEntry {
    line: number;
    elementId: string;
    type: 'heading' | 'paragraph' | 'code' | 'list' | 'image' | 'table' | 'blockquote' | 'other';
    offsetTop: number;
    height: number;
}

describe('LineMapper', () => {
    let mapper: LineMapper;

    // 模拟映射数据
    const mockEntries: MappingEntry[] = [
        { line: 0, elementId: 'h1-title', type: 'heading', offsetTop: 0, height: 50 },
        { line: 5, elementId: 'p-intro', type: 'paragraph', offsetTop: 100, height: 80 },
        { line: 10, elementId: 'h2-section1', type: 'heading', offsetTop: 200, height: 40 },
        { line: 15, elementId: 'p-content1', type: 'paragraph', offsetTop: 280, height: 100 },
        { line: 20, elementId: 'code-1', type: 'code', offsetTop: 400, height: 150 },
        { line: 30, elementId: 'h2-section2', type: 'heading', offsetTop: 600, height: 40 },
        { line: 35, elementId: 'p-content2', type: 'paragraph', offsetTop: 680, height: 120 },
        { line: 50, elementId: 'h2-section3', type: 'heading', offsetTop: 850, height: 40 }
    ];

    beforeEach(() => {
        mapper = new LineMapper();
    });

    describe('build', () => {
        it('应该正确构建映射表', () => {
            mapper.build(mockEntries);
            const stats = mapper.getStats();

            expect(stats.totalEntries).toBe(8);
            expect(stats.uniqueLines).toBe(8);
            expect(stats.uniqueElements).toBe(8);
        });

        it('应该限制最大条目数', () => {
            const smallMapper = new LineMapper({ maxEntries: 3 });
            smallMapper.build(mockEntries);

            const stats = smallMapper.getStats();
            expect(stats.totalEntries).toBe(3);
        });
    });

    describe('findByLine', () => {
        beforeEach(() => {
            mapper.build(mockEntries);
        });

        it('应该精确匹配存在的行号', () => {
            const entry = mapper.findByLine(10);
            expect(entry).not.toBeNull();
            expect(entry!.elementId).toBe('h2-section1');
        });

        it('应该查找最近的映射行', () => {
            // 行 12 在 10 和 15 之间
            const entry = mapper.findByLine(12);
            expect(entry).not.toBeNull();
            // 应该返回行 10 或 15 的映射
            expect(['h2-section1', 'p-content1']).toContain(entry!.elementId);
        });

        it('应该返回第一个元素对于靠前的行', () => {
            const entry = mapper.findByLine(2);
            expect(entry).not.toBeNull();
            expect(entry!.elementId).toBe('h1-title');
        });

        it('应该返回最后一个元素对于靠后的行', () => {
            const entry = mapper.findByLine(100);
            expect(entry).not.toBeNull();
            expect(entry!.elementId).toBe('h2-section3');
        });
    });

    describe('findByOffsetTop', () => {
        beforeEach(() => {
            mapper.build(mockEntries);
        });

        it('应该根据预览位置找到编辑器行号', () => {
            // 位置 250 应该对应 section1 或 content1
            const line = mapper.findByOffsetTop(250);
            expect(line).not.toBeNull();
            // 应该在 10-20 范围内
            expect(line).toBeGreaterThanOrEqual(10);
            expect(line).toBeLessThanOrEqual(20);
        });

        it('应该处理边界情况', () => {
            // 位置 0
            const line0 = mapper.findByOffsetTop(0);
            expect(line0).toBe(0);

            // 很大的位置
            const lineLarge = mapper.findByOffsetTop(1000);
            expect(lineLarge).toBe(50);
        });
    });

    describe('findByElementId', () => {
        beforeEach(() => {
            mapper.build(mockEntries);
        });

        it('应该根据元素ID找到映射条目', () => {
            const entry = mapper.findByElementId('h2-section1');
            expect(entry).not.toBeNull();
            expect(entry!.line).toBe(10);
        });

        it('应该返回 null 对于不存在的元素ID', () => {
            const entry = mapper.findByElementId('non-existent');
            expect(entry).toBeNull();
        });
    });

    describe('getEntriesInRange', () => {
        beforeEach(() => {
            mapper.build(mockEntries);
        });

        it('应该获取范围内的所有映射', () => {
            const entries = mapper.getEntriesInRange(10, 30);
            expect(entries.length).toBe(4); // 10, 15, 20, 30
        });

        it('应该返回空数组对于无效范围', () => {
            const entries = mapper.getEntriesInRange(100, 200);
            expect(entries.length).toBe(0);
        });
    });

    describe('getVisibleEntries', () => {
        beforeEach(() => {
            mapper.build(mockEntries);
        });

        it('应该获取视口内的元素', () => {
            // 视口 200-500
            const visible = mapper.getVisibleEntries(200, 500);
            expect(visible.length).toBeGreaterThan(0);

            // 所有返回的元素应该在视口范围内
            for (const entry of visible) {
                expect(entry.offsetTop + entry.height).toBeGreaterThanOrEqual(200);
                expect(entry.offsetTop).toBeLessThanOrEqual(500);
            }
        });
    });

    describe('calculatePrecisePreviewPosition', () => {
        beforeEach(() => {
            mapper.build(mockEntries);
        });

        it('应该计算精确的预览位置', () => {
            // 行 15 对应 offsetTop 280
            const position = mapper.calculatePrecisePreviewPosition(15);
            expect(position).toBe(280);
        });

        it('应该支持行内进度插值', () => {
            // 行 15 → 280, 行 20 → 400
            // 如果在行 15 的 50% 进度，应该在 280 + (400-280)*0.5 = 340
            const position = mapper.calculatePrecisePreviewPosition(15, 0.5);
            expect(position).toBeCloseTo(340, 0);
        });
    });

    describe('clear', () => {
        it('应该清空映射表', () => {
            mapper.build(mockEntries);
            mapper.clear();

            const stats = mapper.getStats();
            expect(stats.totalEntries).toBe(0);
            expect(stats.uniqueLines).toBe(0);
        });
    });

    describe('性能测试', () => {
        it('大规模映射查找性能', () => {
            // 生成 1000 个映射条目
            const largeEntries: MappingEntry[] = [];
            for (let i = 0; i < 1000; i++) {
                largeEntries.push({
                    line: i * 5,
                    elementId: `el-${i}`,
                    type: i % 3 === 0 ? 'heading' : 'paragraph',
                    offsetTop: i * 50,
                    height: 40
                });
            }

            mapper.build(largeEntries);

            // 测试查找性能
            const iterations = 1000;
            const start = performance.now();

            for (let i = 0; i < iterations; i++) {
                mapper.findByLine(Math.floor(Math.random() * 5000));
            }

            const elapsed = performance.now() - start;
            const avgTime = elapsed / iterations;

            console.log(`大规模映射查找平均耗时: ${avgTime.toFixed(4)}ms`);
            expect(avgTime).toBeLessThan(0.1); // 应该小于 0.1ms
        });
    });
});
