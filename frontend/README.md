Đúng vậy! Với đoạn code hiện tại, mỗi khi bạn đặt một câu hỏi, hàm `process_question_with_gemini()` sẽ gọi hàm `fetch_vehicle_data()`, và hàm này sẽ thực hiện một yêu cầu HTTP GET đến API `http://localhost:8000/api/vehicles`. Điều đó có nghĩa là:

1. **Truy vấn API mỗi lần hỏi**: Mỗi câu hỏi sẽ tạo một yêu cầu mới để lấy dữ liệu JSON từ API.
2. **Tạo JSON**: API của bạn (`http://localhost:8000/api/vehicles`) sẽ truy vấn cơ sở dữ liệu (database) và trả về dữ liệu dưới dạng JSON cho mỗi yêu cầu.

### Vấn đề với cách tiếp cận này
- **Hiệu suất**: Nếu bạn đặt nhiều câu hỏi liên tiếp, việc gọi API liên tục có thể gây chậm trễ (do mạng hoặc thời gian phản hồi của API) và tăng tải cho server/database.
- **Tài nguyên**: Truy vấn database nhiều lần có thể tiêu tốn tài nguyên, đặc biệt nếu dữ liệu lớn hoặc số lượng người dùng tăng.
- **Không cần thiết**: Nếu dữ liệu không thay đổi giữa các câu hỏi, việc truy vấn lại API mỗi lần là không hiệu quả.

### Giải pháp cải thiện
Để tránh truy vấn database và gọi API mỗi lần hỏi, bạn có thể lưu dữ liệu JSON vào bộ nhớ (cache) trong suốt phiên làm việc của chatbot. Dữ liệu chỉ được lấy lại từ API khi cần thiết (ví dụ: khởi động chatbot hoặc khi dữ liệu có thể đã thay đổi). Dưới đây là một số cách để tối ưu:

#### 1. **Lưu dữ liệu vào bộ nhớ (cache)**
Sử dụng một biến toàn cục hoặc bộ nhớ tạm để lưu dữ liệu JSON sau lần gọi API đầu tiên. Dữ liệu sẽ được sử dụng lại cho các câu hỏi tiếp theo.

#### 2. **Cập nhật dữ liệu theo thời gian**
Nếu dữ liệu có thể thay đổi (ví dụ: xe ra vào liên tục), bạn có thể thêm cơ chế làm mới dữ liệu sau một khoảng thời gian nhất định (ví dụ: mỗi 5 phút).

#### 3. **Thêm tùy chọn làm mới thủ công**
Cho phép người dùng yêu cầu làm mới dữ liệu (ví dụ: nhập "làm mới" để lấy dữ liệu mới từ API).

### Code cải tiến với bộ nhớ đệm (cache)
Dưới đây là phiên bản đã được tối ưu, sử dụng bộ nhớ đệm để tránh gọi API mỗi lần hỏi:

```python
import requests
from datetime import datetime, timedelta

# Biến toàn cục để lưu dữ liệu (cache)
cached_data = None
last_fetched_time = None
CACHE_DURATION = 300  # Thời gian cache (giây), ví dụ: 5 phút

# Hàm gọi API từ localhost để lấy dữ liệu xe
def fetch_vehicle_data(force_refresh=False):
    global cached_data, last_fetched_time

    # Kiểm tra xem có nên lấy dữ liệu mới không
    current_time = datetime.now()
    if (
        force_refresh
        or cached_data is None
        or last_fetched_time is None
        or (current_time - last_fetched_time).total_seconds() > CACHE_DURATION
    ):
        url = "http://localhost:8000/api/vehicles"
        try:
            response = requests.get(url, timeout=10)
            if response.status_code == 200:
                cached_data = response.json()
                last_fetched_time = current_time
                print("Đã lấy dữ liệu mới từ API.")
            else:
                print(f"Lỗi API vehicles: Status {response.status_code}, {response.text}")
                return None
        except Exception as e:
            print(f"Lỗi khi gọi API vehicles: {e}")
            return None
    
    return cached_data

# Hàm gọi API Gemini
def call_gemini_api(prompt, api_key):
    url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"
    headers = {
        "Content-Type": "application/json"
    }
    url_with_key = f"{url}?key={api_key}"
    
    payload = {
        "contents": [
            {
                "parts": [
                    {"text": prompt}
                ]
            }
        ]
    }
    
    try:
        response = requests.post(url_with_key, headers=headers, json=payload, timeout=10)
        if response.status_code == 200:
            result = response.json()
            return result["candidates"][0]["content"]["parts"][0]["text"]
        else:
            return f"Lỗi từ Gemini: {response.status_code} - {response.text}"
    except Exception as e:
        return f"Lỗi khi gọi Gemini API: {e}"

# Hàm xử lý câu hỏi và tạo prompt cho Gemini
def process_question_with_gemini(question, api_key, force_refresh=False):
    # Lấy dữ liệu từ API hoặc cache
    data = fetch_vehicle_data(force_refresh=force_refresh)
    if not data:
        return "Không thể lấy dữ liệu từ API vehicles."

    # Chuyển toàn bộ dữ liệu thành chuỗi, kèm theo mô tả cấu trúc để Gemini hiểu
    data_str = "Dữ liệu xe ra vào (mỗi dòng là một bản ghi):\n"
    data_str += "Cấu trúc dữ liệu: mỗi xe có các trường - vehicle_id, license_plate, vehicle_type (Motorcycle/Car), entry_time, exit_time, location, status (Inside/Left), image_url, created_at, updated_at.\n"
    data_str += "\n".join([str(vehicle) for vehicle in data]) if data else "Không có dữ liệu."

    # Tạo prompt chi tiết cho Gemini
    prompt = (
        f"{data_str}\n\n"
        f"Câu hỏi từ người dùng: {question}\n"
        "Hãy phân tích dữ liệu trên và trả lời câu hỏi một cách tự nhiên, thân thiện. "
        "Dựa trên các trường dữ liệu (vehicle_id, license_plate, vehicle_type, entry_time, exit_time, location, status, image_url, created_at, updated_at), "
        "thực hiện các phép tính hoặc tra cứu cần thiết (ví dụ: đếm số lượng, tìm xe theo biển số, tính thời gian, v.v.) nếu có thể. "
        "Nếu câu hỏi liên quan đến ngày, hãy trích xuất ngày từ entry_time hoặc exit_time (định dạng YYYY-MM-DD). "
        "Nếu không có dữ liệu phù hợp, hãy thông báo rõ ràng. "
        "Chỉ trả lời bằng văn bản, không bao gồm code, JSON, hoặc định dạng kỹ thuật."
    )

    # Gọi Gemini API
    response = call_gemini_api(prompt, api_key)
    return response

# Hàm chính để chạy chatbot
def run_chatbot():
    api_key = "AIzaSyBMVIeAr_8vYQziO5eHO7VWxykuBM1rUPc"  # API key của bạn
    print("Chào bạn! Hãy hỏi tôi bất kỳ điều gì về dữ liệu xe ra vào (ví dụ: 'Xe nào ở trong bãi?', 'Tổng số xe ra vào tuần qua?').")
    print("Nhập 'làm mới' để cập nhật dữ liệu từ API.")
    while True:
        question = input("Câu hỏi của bạn: ")
        if question.lower() in ["thoát", "exit", "quit"]:
            print("Tạm biệt!")
            break
        elif question.lower() == "làm mới":
            answer = process_question_with_gemini("Dữ liệu mới nhất", api_key, force_refresh=True)
            print("Dữ liệu đã được làm mới.")
            continue
        answer = process_question_with_gemini(question, api_key)
        print(f"Trả lời: {answer}")

# Chạy chatbot
if __name__ == "__main__":
    run_chatbot()
```

### Những cải tiến chính
1. **Bộ nhớ đệm (cache)**:
   - Dữ liệu từ API được lưu vào biến toàn cục `cached_data` sau lần gọi đầu tiên.
   - Dữ liệu chỉ được lấy lại nếu:
     - Người dùng yêu cầu làm mới (`force_refresh=True` khi nhập "làm mới").
     - Dữ liệu đã hết hạn (sau `CACHE_DURATION`, mặc định là 5 phút).
2. **Tối ưu hiệu suất**:
   - Tránh gọi API `http://localhost:8000/api/vehicles` liên tục, giảm tải cho server và database.
   - Thời gian phản hồi nhanh hơn vì dữ liệu được tái sử dụng từ bộ nhớ.
3. **Tùy chọn làm mới**:
   - Người dùng có thể nhập "làm mới" để lấy dữ liệu mới từ API nếu cần.

### Ví dụ sử dụng
- **Lần đầu hỏi** (ví dụ: "Xe nào ở trong bãi?"):
  - Code sẽ gọi API, lấy dữ liệu JSON, lưu vào `cached_data`, và trả lời:
    ```
    Đã lấy dữ liệu mới từ API.
    Trả lời: Chào bạn! Hiện tại, có 2 xe đang ở trong bãi: Xe Car biển số 51E-777.30 (vào lúc 2025-03-04T23:51:16Z) và Xe Motorcycle biển số 30D-498.95 (vào lúc 2025-03-01T20:30:39Z). Bạn cần thêm thông tin không?
    ```
- **Câu hỏi tiếp theo** (ví dụ: "Tổng số xe ra vào tuần qua?"):
  - Dữ liệu được lấy từ `cached_data`, không gọi API:
    ```
    Trả lời: Chào bạn! Trong tuần qua (từ 6/3/2025 đến 13/3/2025), có 2 xe vào và 2 xe ra. Các xe bao gồm: Xe Motorcycle biển số 31A-297.58 (vào 2025-03-06T09:02:11Z, ra 2025-03-11T23:37:54Z) và Xe Motorcycle biển số 31B-496.56 (vào 2025-03-10T17:05:44Z, ra 2025-03-12T01:30:03Z). Bạn muốn biết thêm không?
    ```
- **Làm mới dữ liệu**:
  - Nhập "làm mới":
    ```
    Dữ liệu đã được làm mới.
    ```

### Lợi ích
- **Hiệu quả**: Giảm số lần truy vấn database/API, cải thiện tốc độ phản hồi.
- **Linh hoạt**: Vẫn cho phép làm mới dữ liệu khi cần.
- **Khả năng mở rộng**: Có thể điều chỉnh `CACHE_DURATION` hoặc thêm logic làm mới dựa trên các điều kiện khác.

### Lưu ý
- **Thời gian cache**: `CACHE_DURATION` hiện là 5 phút (300 giây). Bạn có thể điều chỉnh tùy theo nhu cầu (ví dụ: 60 giây nếu dữ liệu thay đổi thường xuyên).
- **Dữ liệu lớn**: Nếu JSON từ API quá lớn, việc lưu vào bộ nhớ có thể tốn RAM. Trong trường hợp đó, bạn có thể cân nhắc dùng cơ chế cache trên đĩa (ví dụ: lưu vào file) hoặc dùng thư viện caching như `redis`.
- **Tính thời gian thực**: Nếu bạn cần dữ liệu thời gian thực (real-time), có thể bỏ cache hoặc giảm `CACHE_DURATION` xuống 0.

Bạn có thể thử chạy code này và kiểm tra xem hiệu suất có cải thiện không? Nếu bạn muốn thêm các tính năng khác (ví dụ: cache trên đĩa, thông báo thời gian làm mới, v.v.), hãy cho tôi biết nhé!