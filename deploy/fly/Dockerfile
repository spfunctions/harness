FROM node:22-slim

RUN apt-get update && apt-get install -y git curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

RUN mkdir -p /root/sparkco-server

EXPOSE 3848

COPY deploy/fly/start.sh /app/start.sh
RUN chmod +x /app/start.sh

CMD ["/app/start.sh"]
