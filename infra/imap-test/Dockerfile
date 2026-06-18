FROM debian:bookworm-slim

RUN groupadd -g 5000 vmail \
  && useradd -u 5000 -g vmail -d /var/mail -s /usr/sbin/nologin vmail \
  && apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    dovecot-imapd dovecot-core ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY config/ /etc/dovecot/
COPY maildir/ /var/mail/

RUN chown -R vmail:vmail /var/mail

EXPOSE 143

CMD ["dovecot", "-F"]
