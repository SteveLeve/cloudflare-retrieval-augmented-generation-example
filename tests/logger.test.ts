/**
 * Unit tests for Logger utility
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Logger, createLogger } from '../src/utils/logger';

describe('Logger', () => {
	let consoleDebugSpy: any;
	let consoleInfoSpy: any;
	let consoleWarnSpy: any;
	let consoleErrorSpy: any;

	beforeEach(() => {
		// Spy on console methods
		consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
		consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
		consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	it('should create a logger with context', () => {
		const logger = createLogger({ component: 'test' });
		expect(logger).toBeInstanceOf(Logger);
	});

	it('should log debug messages', () => {
		const logger = new Logger();
		logger.debug('Debug message', { key: 'value' });

		expect(consoleDebugSpy).toHaveBeenCalledOnce();
		const logOutput = consoleDebugSpy.mock.calls[0][0];
		expect(logOutput).toContain('DEBUG');
		expect(logOutput).toContain('Debug message');
		expect(logOutput).toContain('key');
	});

	it('should log info messages', () => {
		const logger = new Logger();
		logger.info('Info message');

		expect(consoleInfoSpy).toHaveBeenCalledOnce();
		const logOutput = consoleInfoSpy.mock.calls[0][0];
		expect(logOutput).toContain('INFO');
		expect(logOutput).toContain('Info message');
	});

	it('should log warning messages', () => {
		const logger = new Logger();
		logger.warn('Warning message');

		expect(consoleWarnSpy).toHaveBeenCalledOnce();
		const logOutput = consoleWarnSpy.mock.calls[0][0];
		expect(logOutput).toContain('WARN');
		expect(logOutput).toContain('Warning message');
	});

	it('should log error messages with error object', () => {
		const logger = new Logger();
		const error = new Error('Test error');
		logger.error('Error occurred', error);

		expect(consoleErrorSpy).toHaveBeenCalledOnce();
		const logOutput = consoleErrorSpy.mock.calls[0][0];
		expect(logOutput).toContain('ERROR');
		expect(logOutput).toContain('Error occurred');
		expect(logOutput).toContain('Test error');
	});

	it('should create child logger with merged context', () => {
		const parentLogger = new Logger({ parent: 'value1' });
		const childLogger = parentLogger.child({ child: 'value2' });

		// Log with explicit context to verify merging works
		childLogger.debug('Debug test', { extra: 'data' });

		expect(consoleDebugSpy).toHaveBeenCalled();
		// Get all debug logs
		const debugLogs = consoleDebugSpy.mock.calls.map(call => call[0] as string);
		// Find the log with "Debug test"
		const logOutput = debugLogs.find(log => log.includes('Debug test'));

		expect(logOutput).toBeDefined();
		expect(logOutput).toContain('parent');
		expect(logOutput).toContain('child');
		expect(logOutput).toContain('value1');
		expect(logOutput).toContain('value2');
		expect(logOutput).toContain('extra');
	});

	it('should track timer duration', () => {
		const logger = new Logger();
		logger.startTimer('operation');

		// Simulate some time passing
		const duration = logger.endTimer('operation');

		expect(duration).toBeGreaterThanOrEqual(0);
		expect(consoleInfoSpy).toHaveBeenCalled(); // endTimer logs
		expect(consoleInfoSpy.mock.calls.some(call => call[0].includes('Timer ended: operation'))).toBe(true);
	});

	it('should handle ending timer that was not started', () => {
		const logger = new Logger();
		const duration = logger.endTimer('nonexistent');

		expect(duration).toBe(0);
		expect(consoleWarnSpy).toHaveBeenCalled();
		expect(consoleWarnSpy.mock.calls.some(call => call[0].includes('was not started'))).toBe(true);
	});

	it('should wrap async functions with logging', async () => {
		const logger = new Logger();
		const mockFn = vi.fn().mockResolvedValue('result');

		const result = await Logger.withLogging(logger, 'test-operation', mockFn);

		expect(result).toBe('result');
		expect(mockFn).toHaveBeenCalledOnce();
		expect(consoleInfoSpy).toHaveBeenCalled();
		// Verify both "Starting" and "Timer ended" messages are logged
		const infoCalls = consoleInfoSpy.mock.calls.map(call => call[0]);
		expect(infoCalls.some(call => call.includes('Starting: test-operation'))).toBe(true);
		expect(infoCalls.some(call => call.includes('Timer ended: test-operation'))).toBe(true);
	});

	it('should log errors in wrapped async functions', async () => {
		const logger = new Logger();
		const error = new Error('Async error');
		const mockFn = vi.fn().mockRejectedValue(error);

		await expect(
			Logger.withLogging(logger, 'test-operation', mockFn)
		).rejects.toThrow('Async error');

		expect(consoleErrorSpy).toHaveBeenCalled();
		const errorCalls = consoleErrorSpy.mock.calls.map(call => call[0]);
		expect(errorCalls.some(call => call.includes('Failed: test-operation'))).toBe(true);
	});
});
