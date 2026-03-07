# OTBR với entrypoint wrapper: đợi RCP (/dev/ttyACM0) có mặt rồi mới start.
# Build từ thư mục Dashboard-Thread: docker build -f otbr/Dockerfile -t dashboard-thread-otbr ./otbr
# Hoặc qua compose: docker compose -f docker-compose.yml up otbr --build

FROM openthread/border-router:latest

COPY otbr-entrypoint.sh /otbr-entrypoint.sh
RUN chmod +x /otbr-entrypoint.sh

ENTRYPOINT ["/otbr-entrypoint.sh"]
