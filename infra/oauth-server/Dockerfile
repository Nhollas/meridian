FROM quay.io/keycloak/keycloak:26.5.3

COPY keycloak/realm-import.json /opt/keycloak/data/import/realm-import.json

EXPOSE 8080

ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
CMD ["start-dev", "--import-realm"]
