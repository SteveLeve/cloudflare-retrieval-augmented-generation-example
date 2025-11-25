/**
 * Unit tests for Logger utility
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

	afterEach(() => {
		// Clear spies after each test
		vi.clearAllMocks();
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
		const parentLogger = new Logger({ parent: 'context' });
		const childLogger = parentLogger.child({ child: 'context' });

		childLogger.info('Test message');

		expect(consoleInfoSpy).toHaveBeenCalledOnce();
		const logOutput = consoleInfoSpy.mock.calls[0][0];
		expect(logOutput).toContain('parent');
		expect(logOutput).toContain('child');
	});

	it('should track timer duration', () => {
		const logger = new Logger();
		logger.startTimer('operation');

		// Simulate some time passing
		const duration = logger.endTimer('operation');

		expect(duration).toBeGreaterThanOrEqual(0);
		expect(consoleInfoSpy).toHaveBeenCalledTimes(1); // endTimer logs
	});

	it('should handle ending timer that was not started', () => {
		const logger = new Logger();
		const duration = logger.endTimer('nonexistent');

		expect(duration).toBe(0);
		expect(consoleWarnSpy).toHaveBeenCalledOnce();
	});

	it('should wrap async functions with logging', async () => {
		const logger = new Logger();
		const mockFn = vi.fn().mockResolvedValue('result');

		const result = await Logger.withLogging(logger, 'test-operation', mockFn);

		expect(result).toBe('result');
		expect(mockFn).toHaveBeenCalledOnce();
		expect(consoleInfoSpy).toHaveBeenCalledTimes(2); // start and end
	});

	it('should log errors in wrapped async functions', async () => {
		const logger = new Logger();
		const error = new Error('Async error');
		const mockFn = vi.fn().mockRejectedValue(error);

		await expect(
			Logger.withLogging(logger, 'test-operation', mockFn)
		).rejects.toThrow('Async error');

		expect(consoleErrorSpy).toHaveBeenCalledOnce();
	});
});
