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
        // 加密资源注入与渲染配置无关，必须无条件执行：只要正文中有 data-hs-secret，
        // 就必须注入 hs-secret.js/css，否则前台加密块的按钮永远是 disabled、点击无反应。
        // 早期版本把这一步放在 fetch().map() 内，配置读取为空时 map 不执行、
        // onErrorResume 也不触发（空 Mono 不是错误），导致脚本被静默跳过。
        var baseContent = contentContext.getContent() == null ? "" : contentContext.getContent();
        var withSecret = ScriptUtils.renderSecretAssets(baseContent);

        return reactiveSettingFetcher.fetch("render", RenderConfig.class)
                .map(renderConfig -> {
                    var content = withSecret;
                    if (Boolean.TRUE.equals(renderConfig.getEnableRender()) &&
                        (!Boolean.TRUE.equals(renderConfig.getOnlyMarkdown()) ||
                            "markdown".equals(contentContext.getRawType()))) {
                        content = ScriptUtils.renderScript(renderConfig) + "\n" + content;
                    }
                    contentContext.setContent(ScriptUtils.setContentProperty(content, pluginContext));
                    return contentContext;
                })
                // 配置为空（首次启动缓存未就绪等）时仍保证加密资源已注入。
                .switchIfEmpty(Mono.fromSupplier(() -> {
                    contentContext.setContent(ScriptUtils.setContentProperty(withSecret, pluginContext));
                    return contentContext;
                }))
                .onErrorResume(e -> {
                    if (e instanceof Throwable) {
                        log.error("VditorHeadProcessor process failed", Throwables.getRootCause(e));
                    }
                    contentContext.setContent(ScriptUtils.setContentProperty(withSecret, pluginContext));
                    return Mono.just(contentContext);
                });
    }
}
