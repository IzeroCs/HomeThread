FROM openthread/border-router:latest

RUN apt-get update && apt-get install -y dbus && rm -rf /var/lib/apt/lists/*

COPY otbr-entrypoint.sh /otbr-entrypoint.sh
RUN chmod +x /otbr-entrypoint.sh

ENTRYPOINT ["/otbr-entrypoint.sh"]
