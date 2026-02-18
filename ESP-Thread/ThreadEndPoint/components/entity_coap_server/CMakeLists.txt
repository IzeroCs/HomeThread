idf_component_register(
    SRCS "entity_coap_server.c"
    INCLUDE_DIRS "include"
    REQUIRES
        openthread
        entity_model
        thread_coap
)
