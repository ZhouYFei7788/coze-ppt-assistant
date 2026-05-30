# ---- 基础镜像 Python 3.9 slim ----
FROM python:3.9-slim

# 工作目录
WORKDIR /code

# 安装系统依赖（requests / ssl 需要）
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# 先复制依赖文件，利用 Docker 层缓存
COPY requirements.txt .

# 安装 Python 依赖（双镜像源，国内外都快）
RUN pip install --no-cache-dir \
    -i https://pypi.org/simple/ \
    -r requirements.txt

# 复制源码（不复制 .env，敏感信息通过环境变量注入）
COPY app.py .
COPY static/ ./static/

# 创建上传目录（防止启动时 os.makedirs 失败）
RUN mkdir -p /code/uploads/ppt /code/uploads/recordings

# Railway 动态分配 PORT，默认 9000
ENV PORT=9000

EXPOSE 9000

# 关键：用 python -m uvicorn，防止 "uvicorn is a directory" 权限错误
CMD python -m uvicorn app:app --host 0.0.0.0 --port ${PORT}
