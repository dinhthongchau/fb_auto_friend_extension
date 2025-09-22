// Lấy các phần tử từ UI
const limitInput = document.getElementById('limit');
const delayInput = document.getElementById('delay');
const startButton = document.getElementById('startButton');
const statusDiv = document.getElementById('status');
const maxScrollsInput = document.getElementById('maxScrolls');

// 1. Tải cấu hình đã lưu khi mở popup
document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.sync.get(['limit', 'delay', 'maxScrolls'], (result) => {
        if (result && typeof result.limit === 'number') {
            limitInput.value = result.limit;
        }
        if (result && typeof result.delay === 'number') {
            delayInput.value = result.delay;
        }
        if (result && typeof result.maxScrolls === 'number') {
            maxScrollsInput.value = result.maxScrolls;
        }
    });
});

// 2. Lưu cấu hình khi người dùng thay đổi
limitInput.addEventListener('change', () => {
    const parsed = parseInt(limitInput.value, 10);
    chrome.storage.sync.set({ limit: isNaN(parsed) ? 30 : parsed });
});

delayInput.addEventListener('change', () => {
    const parsed = parseInt(delayInput.value, 10);
    chrome.storage.sync.set({ delay: isNaN(parsed) ? 3 : parsed });
});

maxScrollsInput.addEventListener('change', () => {
    const parsed = parseInt(maxScrollsInput.value, 10);
    chrome.storage.sync.set({ maxScrolls: isNaN(parsed) ? 3 : Math.max(1, parsed) });
});

// 3. Xử lý khi nhấn nút "Bắt đầu"
startButton.addEventListener('click', async () => {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.id) {
            statusDiv.textContent = 'Không tìm thấy tab hiện tại.';
            return;
        }

        const limit = parseInt(limitInput.value, 10) || 30;
        const delay = parseInt(delayInput.value, 10) || 3;
        const maxScrolls = Math.max(1, parseInt(maxScrollsInput.value, 10) || 3);

        statusDiv.textContent = 'Đang chạy...';
        startButton.disabled = true;

        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: runAutoAdd,
            args: [limit, delay, maxScrolls]
        });

        setTimeout(() => {
            statusDiv.textContent = 'Đã gửi lệnh!';
            startButton.disabled = false;
        }, 2000);
    } catch (err) {
        console.error(err);
        statusDiv.textContent = 'Lỗi khi thực thi script.';
        startButton.disabled = false;
    }
});

// Hàm này sẽ được "tiêm" và thực thi trên trang Facebook
function runAutoAdd(limit, delay, maxScrolls) {
    // == Bắt đầu Script ==
    async function addReactersAsFriends() {
        let processedCount = 0;
        let consecutiveScrollsWithNoNew = 0;

        const getButtons = () => Array.from(document.querySelectorAll('div[aria-label="Thêm bạn bè"]'));
        const markProcessed = (btn) => btn.setAttribute('data-fb-auto-friend-processed', '1');
        const isProcessed = (btn) => btn.getAttribute('data-fb-auto-friend-processed') === '1';

        const getScrollable = () => {
            const dialog = document.querySelector('div[role="dialog"]');
            if (dialog) {
                // Try inner scrollable first; fallback to dialog
                const inner = dialog.querySelector('[style*="overflow"]') || dialog.querySelector('div');
                return inner || dialog;
            }
            return document.scrollingElement || document.documentElement || document.body;
        };

        const sleep = (ms) => new Promise(r => setTimeout(r, ms));

        while (true) {
            let buttons = getButtons();
            let unprocessed = buttons.filter(b => !isProcessed(b));

            if (unprocessed.length === 0) {
                // No visible buttons left → attempt to scroll and load more
                const beforeTotal = buttons.length;
                const scrollable = getScrollable();
                const prevScrollTop = scrollable.scrollTop;
                scrollable.scrollTop = scrollable.scrollHeight;
                await sleep(1500);

                buttons = getButtons();
                unprocessed = buttons.filter(b => !isProcessed(b));

                const noNewButtons = unprocessed.length === 0 || buttons.length === beforeTotal;
                const noMoreScroll = scrollable.scrollTop === prevScrollTop; // reached bottom

                if (noNewButtons || noMoreScroll) {
                    consecutiveScrollsWithNoNew += 1;
                } else {
                    consecutiveScrollsWithNoNew = 0;
                }

                if (consecutiveScrollsWithNoNew >= (parseInt(maxScrolls, 10) || 3)) {
                    console.log('✅ Đã cuộn nhiều lần nhưng không có thêm người mới. Dừng lại.');
                    break;
                }

                // Continue loop to re-check buttons
                continue;
            }

            // Process next unprocessed button
            const button = unprocessed[0];
            button.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await sleep(500);
            button.click();
            markProcessed(button);
            processedCount += 1;
            console.log(`✅ Đã gửi yêu cầu thứ ${processedCount}.`);
            if (typeof limit === 'number' && limit > 0 && processedCount >= limit) {
                console.log('⏹ Đạt đến giới hạn tối đa đã cấu hình. Dừng lại.');
                break;
            }

            const baseDelayMs = Math.max(0, (parseInt(delay, 10) || 3) * 1000);
            const randomDelay = baseDelayMs + Math.floor(Math.random() * 2000); // delay..delay+2s
            console.log(`⏳ Tạm dừng ${randomDelay / 1000} giây...`);
            await sleep(randomDelay);
        }

        console.log(`🎉 Hoàn tất! Tổng số lời mời đã gửi: ${processedCount}.`);
    }

    addReactersAsFriends();
    // == Kết thúc Script ==
}


