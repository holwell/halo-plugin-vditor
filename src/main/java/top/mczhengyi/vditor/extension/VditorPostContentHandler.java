package top.mczhengyi.vditor.extension;

import com.google.common.base.Throwables;
import lombok.AllArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;
import run.halo.app.plugin.PluginContext;
import run.halo.app.plugin.ReactiveSettingFetcher;
import run.halo.app.theme.ReactivePostContentHandler;
import top.mczhengyi.vditor.bean.RenderConfig;
import top.mczhengyi.vditor.utils.ScriptUtils;

@Component
@AllArgsConstructor
@Slf4j
public class VditorPostContentHandler implements ReactivePostContentHandler {

    private final ReactiveSettingFetcher reactiveSettingFetcher;

    private final PluginContext pluginContext;

    @Override
    public Mono<PostContentContext> handle(PostContentContext contentContext) {
        return reactiveSettingFetcher.fetch("render", RenderConfig.class)
                .map(renderConfig -> {
                    var content = contentContext.getContent() == null ? "" : contentContext.getContent();
                    if (Boolean.TRUE.equals(renderConfig.getEnableRender()) &&
                        (!Boolean.TRUE.equals(renderConfig.getOnlyMarkdown()) ||
                            "markdown".equals(contentContext.getRawType()))) {
                        content = ScriptUtils.renderScript(renderConfig) + "\n" + content;
                    }
                    content = ScriptUtils.renderSecretAssets(content);
                    contentContext.setContent(ScriptUtils.setContentProperty(content, pluginContext));
                    return contentContext;
                })
                .onErrorResume(e -> {
                    if (e instanceof Throwable) {
                        log.error("VditorHeadProcessor process failed", Throwables.getRootCause(e));
                    }
                    var current = contentContext.getContent();
                    var content = current == null ? "" : ScriptUtils.renderSecretAssets(current);
                    contentContext.setContent(ScriptUtils.setContentProperty(content, pluginContext));
                    return Mono.just(contentContext);
                });
    }
}
